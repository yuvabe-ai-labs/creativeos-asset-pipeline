import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sanitizeSlug,
  timestampSuffix,
  buildStoredName,
  pathForNodeFile,
  pathForImageGen,
  pathForVideoGen,
  pathForClientLogo,
  pathForBrandImage,
  pathForKBDocument,
} from "./paths";

describe("sanitizeSlug", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(sanitizeSlug("My Vacation Photo")).toBe("my-vacation-photo");
  });
  it("strips path separators", () => {
    expect(sanitizeSlug("../etc/passwd")).toBe("etc-passwd");
  });
  it("strips characters outside [a-z0-9-_]", () => {
    expect(sanitizeSlug("hello@world!.txt")).toBe("helloworld.txt");
  });
  it("collapses repeated dashes", () => {
    expect(sanitizeSlug("a   b")).toBe("a-b");
  });
  it("caps length at 60", () => {
    expect(sanitizeSlug("x".repeat(120))).toHaveLength(60);
  });
  it("returns 'untitled' for empty result", () => {
    expect(sanitizeSlug("!!!")).toBe("untitled");
  });
});

describe("timestampSuffix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T14:23:45.678Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("formats UTC with millisecond precision and Z suffix", () => {
    expect(timestampSuffix()).toBe("2026-06-30T14-23-45-678Z");
  });
});

describe("buildStoredName", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T14:23:45.678Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("combines sanitized stem, timestamp, and extension", () => {
    expect(buildStoredName("My Vacation Photo.JPG")).toBe(
      "my-vacation-photo__2026-06-30T14-23-45-678Z.jpg",
    );
  });
  it("handles names without an extension", () => {
    expect(buildStoredName("README")).toBe(
      "readme__2026-06-30T14-23-45-678Z",
    );
  });
  it("accepts an explicit slug + ext override", () => {
    expect(buildStoredName(undefined, { slug: "output", ext: "png" })).toBe(
      "output__2026-06-30T14-23-45-678Z.png",
    );
  });
});

describe("path builders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T14:23:45.678Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("pathForNodeFile", () => {
    expect(
      pathForNodeFile({
        clientId: "c1",
        canvasId: "ca1",
        nodeId: "n1",
        filename: "Photo.jpg",
      }),
    ).toBe(
      "clients/c1/canvases/ca1/nodes/n1/files/photo__2026-06-30T14-23-45-678Z.jpg",
    );
  });
  it("pathForImageGen", () => {
    expect(
      pathForImageGen({
        clientId: "c1",
        canvasId: "ca1",
        nodeId: "n1",
        ext: "png",
      }),
    ).toBe(
      "clients/c1/canvases/ca1/nodes/n1/image-gen/output__2026-06-30T14-23-45-678Z.png",
    );
  });
  it("pathForVideoGen defaults ext to mp4", () => {
    expect(
      pathForVideoGen({ clientId: "c1", canvasId: "ca1", nodeId: "n1" }),
    ).toBe(
      "clients/c1/canvases/ca1/nodes/n1/video-gen/output__2026-06-30T14-23-45-678Z.mp4",
    );
  });
  it("pathForClientLogo", () => {
    expect(
      pathForClientLogo({ clientId: "c1", filename: "ACME Logo.png" }),
    ).toBe("clients/c1/logo/acme-logo__2026-06-30T14-23-45-678Z.png");
  });
  it("pathForBrandImage nests under imageId", () => {
    expect(
      pathForBrandImage({
        clientId: "c1",
        imageId: "img1",
        filename: "Hero.jpg",
      }),
    ).toBe(
      "clients/c1/brand-images/img1/hero__2026-06-30T14-23-45-678Z.jpg",
    );
  });
  it("pathForKBDocument nests under docId", () => {
    expect(
      pathForKBDocument({
        clientId: "c1",
        docId: "doc1",
        filename: "Brief.pdf",
      }),
    ).toBe(
      "clients/c1/kb-documents/doc1/brief__2026-06-30T14-23-45-678Z.pdf",
    );
  });
});
