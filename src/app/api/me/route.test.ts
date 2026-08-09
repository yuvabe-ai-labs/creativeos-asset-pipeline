import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { display_name: "Arun" }, error: null }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/db/organizations", () => ({
  getOrgById: vi.fn(async () => ({
    id: "org-1",
    name: "Yuvabe Studios",
    slug: "yuvabe",
    monthly_credit_limit: 1000,
    created_at: "t",
  })),
  getOrgCreditUsage: vi.fn(async () => 42),
}));

describe("GET /api/me", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the real orgRole alongside the collapsed gating role", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // orgRoleToIdentityRole("owner") collapses to "senior" — that field must stay as-is,
    // it's frozen per D53 and still gates the Approve feature.
    expect(body.role).toBe("senior");
    // orgRole is the new, real value — this is what Task 4's popover displays as "Owner".
    expect(body.orgRole).toBe("owner");
    expect(body.name).toBe("Arun");
    expect(body.orgName).toBe("Yuvabe Studios");
  });
});
