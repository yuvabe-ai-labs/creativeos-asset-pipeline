// src/app/api/me/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Access } from "@/lib/permissions/access";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  access: undefined as Access | undefined,
  getOrgCreditUsage: vi.fn(async () => 42),
}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    email: "a@example.com",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "designer",
    mustChangePassword: false,
    access: m.access,
  })),
  resolveCallerContextOrNull: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/organizations", () => ({
  getOrgById: vi.fn(async () => ({ id: "org-1", name: "Yuvabe Studios", slug: "y", monthly_credit_limit: 1000, created_at: "t" })),
  getOrgCreditUsage: m.getOrgCreditUsage,
}));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => "Arun") }));
vi.mock("@/lib/db/presets", () => ({
  getPresetName: vi.fn(async (key: string) => ({ owner: "Owner", senior: "Senior", designer: "Designer" } as Record<string, string>)[key] ?? null),
}));

import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { abilityFromPacked, canInBrowser } from "@/lib/permissions/browser";
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

  it("sends the owner's rules, all clients, the preset name and the credit figures", async () => {
    m.access = testOwnerAccess();
    const me = await body();
    expect(me).toMatchObject({
      name: "Arun",
      orgId: "org-1",
      orgName: "Yuvabe Studios",
      presetKey: "owner",
      presetName: "Owner",
      clientScope: "all",
      creditsUsed: 42,
      monthlyCreditLimit: 1000,
    });
    expect(canInBrowser(abilityFromPacked(me.permissions), "team.edit")).toBe(true);
  });

  it("sends no credit figures, and reads none, without credits.view", async () => {
    m.access = testAccess({ keys: ["scripts.view"] });
    const me = await body();
    expect(me.creditsUsed).toBeNull();
    expect(me.monthlyCreditLimit).toBeNull();
    expect(m.getOrgCreditUsage).not.toHaveBeenCalled();
  });

  it("sends a picked list as ids, with rules that refuse other clients", async () => {
    m.access = testAccess({ keys: ["scripts.edit"], clientIds: ["c2", "c1"], presetKey: "designer" });
    const me = await body();
    expect(me.clientScope).toEqual(["c1", "c2"]);
    expect(me.presetName).toBe("Designer");
    const ability = abilityFromPacked(me.permissions);
    expect(canInBrowser(ability, "scripts.edit", "c1")).toBe(true);
    expect(canInBrowser(ability, "scripts.edit", "c3")).toBe(false);
  });
});
