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
  getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1" })),
}));
vi.mock("@/lib/asset-import/start", () => {
  class ImportTargetError extends Error {}
  return { ImportTargetError, setImportTarget: vi.fn(), startAssetImports: vi.fn() };
});

import { ImportTargetError, setImportTarget, startAssetImports } from "@/lib/asset-import/start";

const put = (source: string, body: unknown) => [
  new Request(`http://test/api/clients/client-1/asset-imports/sources/${source}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id: "client-1", source }) },
] as const;

const TARGETS = { website: null, instagram: "https://www.instagram.com/cocacola/", facebook: null };

describe("PUT /api/clients/[id]/asset-imports/sources/[source]", () => {
  beforeEach(() => {
    vi.mocked(setImportTarget).mockReset().mockResolvedValue(TARGETS);
    vi.mocked(startAssetImports).mockReset().mockResolvedValue([{ id: "j1" }] as never);
  });

  it("saves the handle and imports that source", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(...put("instagram", { value: "@cocacola" }));
    expect(res.status).toBe(200);
    expect(setImportTarget).toHaveBeenCalledWith("client-1", "instagram", "@cocacola");
    expect(startAssetImports).toHaveBeenCalledWith({ clientId: "client-1", sources: ["instagram"], userId: "user-1" });
    expect(await res.json()).toMatchObject({ targets: TARGETS, imports: [{ id: "j1" }] });
  });

  it("disconnects without importing when cleared", async () => {
    vi.mocked(setImportTarget).mockResolvedValue({ ...TARGETS, instagram: null });
    const { PUT } = await import("./route");
    await PUT(...put("instagram", { value: "" }));
    expect(startAssetImports).not.toHaveBeenCalled();
  });

  it("answers 400 for a handle that cannot be one", async () => {
    vi.mocked(setImportTarget).mockRejectedValue(new ImportTargetError("That isn't an Instagram handle or link."));
    const { PUT } = await import("./route");
    const res = await PUT(...put("instagram", { value: "two words" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Instagram handle/);
  });

  it("rejects an unknown source and a missing value", async () => {
    const { PUT } = await import("./route");
    expect((await PUT(...put("tiktok", { value: "x" }))).status).toBe(404);
    expect((await PUT(...put("instagram", {}))).status).toBe(400);
  });
});
