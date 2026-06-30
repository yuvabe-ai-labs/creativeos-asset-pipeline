import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockBucketState,
  _resetMockStorage,
} from "../../../__mocks__/@google-cloud/storage";

vi.mock("@google-cloud/storage");

vi.mock("./ownership", () => ({
  resolveOwnership: vi.fn(async () => ({
    clientId: "c1",
    canvasId: "ca1",
  })),
}));

const mockSupabaseRemove = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    storage: {
      from: () => ({ remove: mockSupabaseRemove }),
    },
  }),
}));

import {
  uploadNodeFile,
  uploadImageGen,
  uploadVideoGen,
  uploadClientLogo,
  uploadBrandImage,
  uploadKBDocument,
  removeObject,
  parsePathFromUrl,
} from "./index";
import { _resetGcsClient } from "./gcs";

beforeEach(() => {
  process.env.GCP_PROJECT_ID = "test-project";
  process.env.GCS_BUCKET = "test-bucket";
  process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64 = Buffer.from(
    JSON.stringify({ client_email: "x", private_key: "y" }),
  ).toString("base64");
  _resetGcsClient();
  _resetMockStorage();
  mockSupabaseRemove.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-30T14:23:45.678Z"));
});

describe("uploadNodeFile", () => {
  it("uploads under the resolved ownership path and returns a public URL", async () => {
    const result = await uploadNodeFile({
      nodeId: "n1",
      filename: "Photo.jpg",
      body: Buffer.from("hello"),
      contentType: "image/jpeg",
    });
    expect(result.path).toBe(
      "clients/c1/canvases/ca1/nodes/n1/files/photo__2026-06-30T14-23-45-678Z.jpg",
    );
    expect(result.url).toBe(
      `https://storage.googleapis.com/test-bucket/${result.path}`,
    );
    const stored = mockBucketState.get("test-bucket")!.get(result.path)!;
    expect(stored.body.toString()).toBe("hello");
    expect(stored.contentType).toBe("image/jpeg");
  });
});

describe("uploadImageGen", () => {
  it("uses image-gen/output path", async () => {
    const result = await uploadImageGen({
      nodeId: "n1",
      ext: "png",
      body: Buffer.from("img"),
      contentType: "image/png",
    });
    expect(result.path).toBe(
      "clients/c1/canvases/ca1/nodes/n1/image-gen/output__2026-06-30T14-23-45-678Z.png",
    );
  });
});

describe("uploadVideoGen", () => {
  it("defaults ext to mp4", async () => {
    const result = await uploadVideoGen({
      nodeId: "n1",
      body: Buffer.from("vid"),
      contentType: "video/mp4",
    });
    expect(result.path).toBe(
      "clients/c1/canvases/ca1/nodes/n1/video-gen/output__2026-06-30T14-23-45-678Z.mp4",
    );
  });
});

describe("uploadClientLogo / uploadBrandImage / uploadKBDocument", () => {
  it("uploadClientLogo", async () => {
    const r = await uploadClientLogo({
      clientId: "c1",
      filename: "Logo.png",
      body: Buffer.from("a"),
      contentType: "image/png",
    });
    expect(r.path).toBe(
      "clients/c1/logo/logo__2026-06-30T14-23-45-678Z.png",
    );
  });
  it("uploadBrandImage", async () => {
    const r = await uploadBrandImage({
      clientId: "c1",
      imageId: "img1",
      filename: "Hero.jpg",
      body: Buffer.from("a"),
      contentType: "image/jpeg",
    });
    expect(r.path).toBe(
      "clients/c1/brand-images/img1/hero__2026-06-30T14-23-45-678Z.jpg",
    );
  });
  it("uploadKBDocument", async () => {
    const r = await uploadKBDocument({
      clientId: "c1",
      docId: "d1",
      filename: "Brief.pdf",
      body: Buffer.from("a"),
      contentType: "application/pdf",
    });
    expect(r.path).toBe(
      "clients/c1/kb-documents/d1/brief__2026-06-30T14-23-45-678Z.pdf",
    );
  });
});

describe("parsePathFromUrl", () => {
  it("returns the path for a GCS URL", () => {
    expect(
      parsePathFromUrl(
        "https://storage.googleapis.com/test-bucket/foo/bar.png",
      ),
    ).toBe("foo/bar.png");
  });
  it("returns null for non-GCS URLs", () => {
    expect(parsePathFromUrl("https://example.com/foo.png")).toBeNull();
  });
});

describe("removeObject", () => {
  it("deletes from GCS for a storage.googleapis.com URL", async () => {
    mockBucketState.set(
      "test-bucket",
      new Map([["foo/bar.png", { body: Buffer.from(""), contentType: "x" }]]),
    );
    await removeObject(
      "https://storage.googleapis.com/test-bucket/foo/bar.png",
    );
    expect(mockBucketState.get("test-bucket")!.has("foo/bar.png")).toBe(false);
    expect(mockSupabaseRemove).not.toHaveBeenCalled();
  });
  it("deletes from GCS for a bare path", async () => {
    mockBucketState.set(
      "test-bucket",
      new Map([["foo/baz.png", { body: Buffer.from(""), contentType: "x" }]]),
    );
    await removeObject("foo/baz.png");
    expect(mockBucketState.get("test-bucket")!.has("foo/baz.png")).toBe(false);
  });
  it("routes a supabase.co URL to Supabase Storage remove", async () => {
    await removeObject(
      "https://abc.supabase.co/storage/v1/object/public/kb-documents/c1/d1/file.pdf",
    );
    expect(mockSupabaseRemove).toHaveBeenCalledWith(["c1/d1/file.pdf"]);
  });
  it("throws for an unrecognized URL", async () => {
    await expect(removeObject("https://example.com/foo")).rejects.toThrow(
      /Unrecognized storage URL/,
    );
  });
});
