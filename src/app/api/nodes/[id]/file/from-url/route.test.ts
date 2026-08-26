import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ uploadNodeFile: vi.fn(), removeObject: vi.fn() }));
vi.mock("@/lib/storage/node-file-cleanup", () => ({
  removeNodeFileObject: vi.fn(async () => ({ removed: true })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: {} } }) }) }) }),
  })),
}));

import { uploadNodeFile } from "@/lib/storage";

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/nodes/node-1/file/from-url", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "node-1" });

function stubFetch(contentType: string, byteLength: number) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => new ArrayBuffer(byteLength),
  })));
}

describe("POST /api/nodes/[id]/file/from-url", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

  it("re-hosts a remote image to GCS and returns the patch", async () => {
    stubFetch("image/png", 100);
    vi.mocked(uploadNodeFile).mockResolvedValueOnce({ url: "https://gcs/bucket/ref.png", path: "p/ref.png" });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ imageUrl: "https://i.pinimg.com/x/ref.png", sourceUrl: "https://pin" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileUrl).toBe("https://gcs/bucket/ref.png");
    expect(body.fileKind).toBe("image");
    expect(body.fileExt).toBe("png");
    expect(vi.mocked(uploadNodeFile)).toHaveBeenCalledOnce();
  });

  it("rejects a non-image content-type with 400", async () => {
    stubFetch("text/html", 100);
    const { POST } = await import("./route");
    const res = await POST(makeReq({ imageUrl: "https://x/page.html" }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(uploadNodeFile)).not.toHaveBeenCalled();
  });

  it("rejects an oversize image with 400", async () => {
    stubFetch("image/png", 11 * 1024 * 1024);
    const { POST } = await import("./route");
    const res = await POST(makeReq({ imageUrl: "https://x/big.png" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when imageUrl is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeReq({}), { params });
    expect(res.status).toBe(400);
  });
});
