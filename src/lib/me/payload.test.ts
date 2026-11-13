// src/lib/me/payload.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ caller: null as unknown, failOrg: false }));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async () => m.caller),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/organizations", () => ({
  getOrgById: vi.fn(async () => {
    if (m.failOrg) throw new Error("db down");
    return { id: "org-1", name: "Yuvabe Studios", slug: "y", monthly_credit_limit: null, created_at: "t" };
  }),
  getOrgCreditUsage: vi.fn(async () => 0),
}));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => null) }));

import { testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { loadInitialMe } from "./payload";

const signedIn = () => ({ userId: "u1", email: null, platformRole: "member", orgId: "org-1", mustChangePassword: false, access: testOwnerAccess() });

describe("loadInitialMe", () => {
  it("is null with nobody signed in", async () => {
    m.caller = null;
    expect(await loadInitialMe()).toBeNull();
  });

  it("builds the payload for a signed-in owner, naming them User without a profile", async () => {
    m.caller = signedIn();
    m.failOrg = false;
    expect(await loadInitialMe()).toMatchObject({ name: "User", isOwner: true, accessGiven: true, clients: [], creditsUsed: 0 });
  });

  it("is null, not an error, when a read fails", async () => {
    m.caller = signedIn();
    m.failOrg = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadInitialMe()).toBeNull();
    err.mockRestore();
  });
});
