import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.unmock("@/lib/permissions/server");

const { callerMock, impersonationMock } = vi.hoisted(() => ({
  callerMock: vi.fn(),
  impersonationMock: vi.fn(),
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: callerMock }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: impersonationMock }));

import { accessOf, resolveActingCaller } from "./server";
import { testAccess } from "./test-fixtures";

describe("accessOf", () => {
  it("returns the caller's access", () => {
    const access = testAccess({ permissions: ["view"], clientIds: ["c1"] });
    expect(accessOf({ access })).toBe(access);
  });

  it("throws when access was not loaded (fail closed)", () => {
    expect(() => accessOf({})).toThrow("Access was not loaded for this request.");
  });
});

describe("resolveActingCaller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the caller's own agency and access when not impersonating", async () => {
    const access = testAccess({ permissions: ["view"], clientIds: ["c1"] });
    callerMock.mockResolvedValue({ userId: "u1", orgId: "org-1", access });
    impersonationMock.mockResolvedValue({ isImpersonating: false });
    const acting = await resolveActingCaller();
    expect(acting.effectiveOrgId).toBe("org-1");
    expect(acting.caller.access).toBe(access);
  });

  it("acts as the target agency's owner while impersonating, as a super admin", async () => {
    callerMock.mockResolvedValue({ userId: "op", orgId: "yuvabe", access: testAccess({ permissions: [], clientIds: [], orgId: "yuvabe" }) });
    impersonationMock.mockResolvedValue({ isImpersonating: true, operatorId: "op", targetOrgId: "org-9", elevated: false });
    const acting = await resolveActingCaller();
    expect(acting.effectiveOrgId).toBe("org-9");
    expect(acting.caller.access.isSuperAdmin).toBe(true);
    expect(acting.caller.access.orgs.get("org-9")?.isOwner).toBe(true);
    expect(acting.caller.orgId).toBe("yuvabe");
  });
});
