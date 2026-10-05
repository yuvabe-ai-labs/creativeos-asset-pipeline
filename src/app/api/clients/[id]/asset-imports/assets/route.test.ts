import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveOrgId: vi.fn(async () => "org-1") }));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({
  logImpersonationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1" })),
}));
vi.mock("@/lib/db/kb", () => ({ listImportedBrandImagesPage: vi.fn() }));

import { listImportedBrandImagesPage } from "@/lib/db/kb";
import { decodeAssetCursor, encodeAssetCursor } from "@/lib/asset-import/utils";

const params = Promise.resolve({ id: "client-1" });
const get = (qs = "") => new Request(`http://test/api/clients/client-1/asset-imports/assets${qs}`);
const LAST = { sortAt: "2026-10-02T12:34:54+00:00", id: "6f1d2c1e-8a3b-4c5d-9e0f-1a2b3c4d5e6f" };

describe("GET /api/clients/[id]/asset-imports/assets", () => {
  beforeEach(() => {
    vi.mocked(listImportedBrandImagesPage).mockReset();
    vi.mocked(listImportedBrandImagesPage).mockResolvedValue({ items: [{ id: "a1" }] as never, next: LAST });
  });

  it("returns a page and an opaque cursor for the next one", async () => {
    const { GET } = await import("./route");
    const res = await GET(get(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([{ id: "a1" }]);
    expect(decodeAssetCursor(body.nextCursor)).toEqual(LAST);
    expect(listImportedBrandImagesPage).toHaveBeenCalledWith("client-1", {
      limit: 24,
      after: null,
      source: null,
      mediaType: null,
    });
  });

  it("passes the decoded cursor, filters, and a clamped limit", async () => {
    const { GET } = await import("./route");
    await GET(get(`?cursor=${encodeAssetCursor(LAST)}&source=instagram&media=video&limit=500`), { params });
    expect(listImportedBrandImagesPage).toHaveBeenCalledWith("client-1", {
      limit: 60,
      after: LAST,
      source: "instagram",
      mediaType: "video",
    });
  });

  it("returns a null cursor on the last page", async () => {
    vi.mocked(listImportedBrandImagesPage).mockResolvedValue({ items: [], next: null });
    const { GET } = await import("./route");
    const body = await (await GET(get(), { params })).json();
    expect(body.nextCursor).toBeNull();
  });

  it.each(["?cursor=garbage", "?source=tiktok", "?media=audio"])("rejects %s", async (qs) => {
    const { GET } = await import("./route");
    const res = await GET(get(qs), { params });
    expect(res.status).toBe(400);
    expect(listImportedBrandImagesPage).not.toHaveBeenCalled();
  });
});
