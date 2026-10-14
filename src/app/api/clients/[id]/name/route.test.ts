import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ resolveOrgId: vi.fn(async () => "org-1") }));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({
  logImpersonationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(),
  renameClient: vi.fn(),
}));

import { getClientById, renameClient } from "@/lib/db/clients";

const params = Promise.resolve({ id: "client-1" });
const patch = (body: unknown) =>
  new Request("http://test/api/clients/client-1/name", { method: "PATCH", body: JSON.stringify(body) });

describe("PATCH /api/clients/[id]/name", () => {
  beforeEach(() => {
    vi.mocked(renameClient).mockReset();
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-1" } as never);
  });

  it("renames the client to the trimmed name", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ name: "  Chupps  " }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Chupps" });
    expect(renameClient).toHaveBeenCalledWith("client-1", "Chupps");
  });

  it.each([{ name: "   " }, {}, { name: 42 }, { name: "x".repeat(121) }])("rejects %j", async (body) => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch(body), { params });
    expect(res.status).toBe(400);
    expect(renameClient).not.toHaveBeenCalled();
  });

  it("is a 404 for another org's client", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-2" } as never);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ name: "Chupps" }), { params });
    expect(res.status).toBe(404);
    expect(renameClient).not.toHaveBeenCalled();
  });
});
