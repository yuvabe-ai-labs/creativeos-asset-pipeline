import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

vi.mock("@/lib/supabase/ssr-server", () => ({
  createSSRServerClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/supabase/get-user-with-retry", () => ({
  getUserWithRetry: vi.fn(async () => ({ id: "op-1", email: "op@yuvabe.com", app_metadata: { platform_role: "super_admin" } })),
}));
const membershipMock = vi.fn(async () => ({
  data: { org_id: "yuvabe-org", org_role: "owner" },
  error: null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: membershipMock }) }) }),
  })),
}));

import { encodeImpersonationCookie } from "@/lib/auth/impersonation-logic";

const SECRET = "test-secret";

describe("page-level org resolution uses resolveOrgId(), not caller.orgId", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
    membershipMock.mockResolvedValue({ data: { org_id: "yuvabe-org", org_role: "owner" }, error: null });
  });

  it("resolves the operator's own org when not impersonating", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const { resolveOrgId } = await import("@/lib/dal");
    await expect(resolveOrgId()).resolves.toBe("yuvabe-org");
  });

  it("resolves the impersonation target org when a valid session cookie is present", async () => {
    const cookie = encodeImpersonationCookie(
      {
        operatorId: "op-1",
        targetOrgId: "target-org",
        elevated: false,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      SECRET,
    );
    cookieStore.get.mockReturnValue({ value: cookie });
    const { resolveOrgId } = await import("@/lib/dal");
    await expect(resolveOrgId()).resolves.toBe("target-org");
  });
});
