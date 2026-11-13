// src/app/api/me/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Access } from "@/lib/permissions/model";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  access: undefined as Access | undefined,
  getOrgCreditUsage: vi.fn(async () => 42),
  getOrgById: vi.fn(async () => ({ id: "org-1", name: "Yuvabe Studios", slug: "y", monthly_credit_limit: 1000, created_at: "t" })),
}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    email: "a@example.com",
    platformRole: "member",
    orgId: "org-1",
    mustChangePassword: false,
    access: m.access,
  })),
  resolveCallerContextOrNull: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/organizations", () => ({
  getOrgById: m.getOrgById,
  getOrgCreditUsage: m.getOrgCreditUsage,
}));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => "Arun") }));

import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { check } from "@/lib/permissions/check";
import { accessFromMe } from "@/lib/me/access";
import { GET } from "./route";

async function body() {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/me", () => {
  beforeEach(() => {
    m.getOrgCreditUsage.mockClear();
    m.access = undefined;
  });

  it("sends the owner's agency, owner flag and credit figures", async () => {
    m.access = testOwnerAccess();
    const me = await body();
    expect(me).toMatchObject({
      name: "Arun",
      orgId: "org-1",
      orgName: "Yuvabe Studios",
      isOwner: true,
      accessGiven: true,
      clients: [],
      creditsUsed: 42,
      monthlyCreditLimit: 1000,
    });
    expect(check(accessFromMe(me), "manage_team", { orgId: "org-1", clientId: null })).toBe("allow");
  });

  it("sends no credit figures, and reads none, to a member", async () => {
    m.access = testAccess({ permissions: ["view"], clientIds: ["c1"] });
    const me = await body();
    expect(me.creditsUsed).toBeNull();
    expect(me.monthlyCreditLimit).toBeNull();
    expect(m.getOrgCreditUsage).not.toHaveBeenCalled();
  });

  it("sends each client with its permissions, sorted, and the browser decides the same", async () => {
    m.access = testAccess({ permissions: ["view", "edit"], clientIds: ["c2", "c1"] });
    const me = await body();
    expect(me.isOwner).toBe(false);
    expect(me.permissions).toEqual(["view", "edit"]);
    expect(me.clients).toEqual([
      { clientId: "c1", permissions: ["view", "edit"] },
      { clientId: "c2", permissions: ["view", "edit"] },
    ]);
    const browser = accessFromMe(me);
    expect(check(browser, "edit", { orgId: "org-1", clientId: "c1" })).toBe("allow");
    expect(check(browser, "edit", { orgId: "org-1", clientId: "c3" })).toBe("not_found");
  });

  it("answers a failed read with plain copy", async () => {
    m.access = testOwnerAccess();
    m.getOrgById.mockRejectedValueOnce(new Error("relation organizations does not exist"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not load your account." });
    err.mockRestore();
  });
});
