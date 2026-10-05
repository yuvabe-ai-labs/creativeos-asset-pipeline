import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContextOrNull: vi.fn(async () => ({ userId: "user-1" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({
  logImpersonationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1", slug: "acme", name: "Acme" })),
}));
vi.mock("@/lib/db/kb", () => ({ listBrandImages: vi.fn() }));
vi.mock("@/lib/asset-import/start", () => ({
  listLatestAssetImports: vi.fn(),
  startAssetImports: vi.fn(),
}));

import { getClientById } from "@/lib/db/clients";
import { listBrandImages } from "@/lib/db/kb";
import { listLatestAssetImports, startAssetImports } from "@/lib/asset-import/start";

const params = Promise.resolve({ id: "client-1" });
const url = "http://test/api/clients/client-1/asset-imports";
const IMPORT = { id: "j1", source: "instagram", status: "running" };

describe("/api/clients/[id]/asset-imports", () => {
  beforeEach(() => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-1" } as never);
  });

  it("GET returns each source's latest import and the imported assets only", async () => {
    vi.mocked(listLatestAssetImports).mockResolvedValue([IMPORT] as never);
    vi.mocked(listBrandImages).mockResolvedValue([{ id: "a1" }] as never);
    const { GET } = await import("./route");
    const res = await GET(new Request(url), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ imports: [IMPORT], assets: [{ id: "a1" }] });
    expect(listBrandImages).toHaveBeenCalledWith("client-1", "imported");
  });

  it("POST starts the given sources and records who asked", async () => {
    vi.mocked(startAssetImports).mockResolvedValue([IMPORT] as never);
    const { POST } = await import("./route");
    const res = await POST(new Request(url, { method: "POST", body: JSON.stringify({ sources: ["instagram"] }) }), { params });
    expect(res.status).toBe(200);
    expect(startAssetImports).toHaveBeenCalledWith({ clientId: "client-1", sources: ["instagram"], userId: "user-1" });
  });

  it("POST with no body starts every source", async () => {
    vi.mocked(startAssetImports).mockResolvedValue([] as never);
    const { POST } = await import("./route");
    await POST(new Request(url, { method: "POST" }), { params });
    expect(startAssetImports).toHaveBeenCalledWith({ clientId: "client-1", sources: undefined, userId: "user-1" });
  });

  it("POST rejects an unknown source", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request(url, { method: "POST", body: JSON.stringify({ sources: ["tiktok"] }) }), { params });
    expect(res.status).toBe(400);
  });

  it("is a 404 for another org's client", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-2" } as never);
    const { GET } = await import("./route");
    const res = await GET(new Request(url), { params });
    expect(res.status).toBe(404);
  });
});
