import { describe, it, expect, vi, beforeEach } from "vitest";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import type { Access } from "@/lib/permissions/model";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { callerMock } = vi.hoisted(() => ({ callerMock: vi.fn() }));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: callerMock, resolveOrgId: vi.fn(async () => "org-1") }));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(), setClientArchived: vi.fn() }));

import { getClientById, setClientArchived } from "@/lib/db/clients";
import { PATCH } from "./route";

const as = (access: Access) => callerMock.mockResolvedValue({ userId: "u1", orgId: "org-1", access });
const params = Promise.resolve({ id: "client-1" });
const patch = () =>
  PATCH(new Request("http://test/api/clients/client-1", { method: "PATCH", body: JSON.stringify({ archived: true }) }), { params });

describe("PATCH /api/clients/[id]", () => {
  beforeEach(() => {
    vi.mocked(setClientArchived).mockReset();
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-1" } as never);
  });

  it("answers 404, not 403, to a member who is not on that client", async () => {
    as(testAccess({ permissions: ["generate", "delete"], clientIds: ["client-9"] }));
    const res = await patch();
    expect(res.status).toBe(404);
    expect(setClientArchived).not.toHaveBeenCalled();
  });

  it("answers 403 to a member on the client (archiving is the owner's)", async () => {
    as(testAccess({ permissions: ["generate", "delete"], clientIds: ["client-1"] }));
    expect((await patch()).status).toBe(403);
    expect(setClientArchived).not.toHaveBeenCalled();
  });

  it("lets the owner archive", async () => {
    as(testOwnerAccess());
    expect((await patch()).status).toBe(200);
    expect(setClientArchived).toHaveBeenCalledWith("client-1", true);
  });
});
