import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn().mockResolvedValue("ya29.test"),
  fetchDriveFileBuffer: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  uploadNodeFile: vi.fn(),
  removeObject: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { data: {} } }),
        }),
      }),
    }),
  })),
}));

import { exchangeRefreshToken, fetchDriveFileBuffer } from "@/lib/drive/client";
import { uploadNodeFile, removeObject } from "@/lib/storage";

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/nodes/node-1/file/drive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "node-1" });

describe("POST /api/nodes/[id]/file/drive", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(exchangeRefreshToken).mockResolvedValue("ya29.test");
  });

  it("returns 400 for unsupported MIME type", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "abc", driveFileName: "virus.exe", driveMimeType: "application/x-msdownload" }),
      { params }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not supported/i);
  });

  it("uploads image to GCS and returns FileNodeData patch", async () => {
    const fakeBuffer = new ArrayBuffer(100);
    vi.mocked(fetchDriveFileBuffer).mockResolvedValueOnce({
      buffer: fakeBuffer,
      contentType: "image/png",
    });
    vi.mocked(uploadNodeFile).mockResolvedValueOnce({
      url: "https://storage.googleapis.com/bucket/path/logo.png",
      path: "path/logo.png",
    });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "file-123", driveFileName: "logo.png", driveMimeType: "image/png" }),
      { params }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileUrl).toBe("https://storage.googleapis.com/bucket/path/logo.png");
    expect(body.fileKind).toBe("image");
    expect(body.fileExt).toBe("png");
    expect(body.driveFileId).toBe("file-123");
    expect(body.driveFileName).toBe("logo.png");
    expect(body.driveMimeType).toBe("image/png");
  });

  it("stores rawText inline for text/plain files", async () => {
    const encoder = new TextEncoder();
    const fakeBuffer = encoder.encode("hello world").buffer;
    vi.mocked(fetchDriveFileBuffer).mockResolvedValueOnce({
      buffer: fakeBuffer,
      contentType: "text/plain",
    });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "txt-1", driveFileName: "notes.txt", driveMimeType: "text/plain" }),
      { params }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rawText).toBe("hello world");
    expect(body.fileUrl).toBeUndefined();
    expect(uploadNodeFile).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing required fields", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "abc" }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when Drive fetch fails", async () => {
    vi.mocked(fetchDriveFileBuffer).mockRejectedValueOnce(new Error("403 Forbidden"));

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "bad", driveFileName: "img.png", driveMimeType: "image/png" }),
      { params }
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Google Drive/i);
  });
});
