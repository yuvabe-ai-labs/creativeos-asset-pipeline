import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { testMembershipRow } from "@/lib/permissions/test-fixtures";

vi.mock("server-only", () => ({}));

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error("REDIRECT " + to);
  }),
}));
vi.mock("@/lib/supabase/ssr-server", () => ({
  createSSRServerClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/supabase/get-user-with-retry", () => ({
  getUserWithRetry: vi.fn(async () => ({ id: "op-1", email: "op@yuvabe.com", app_metadata: { platform_role: "super_admin" } })),
}));
const rpcMock = vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({
  data: [testMembershipRow({ org_id: "yuvabe-org" })],
  error: null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ rpc: rpcMock })),
}));

import { getUserWithRetry } from "@/lib/supabase/get-user-with-retry";
import { encodeImpersonationCookie } from "@/lib/auth/impersonation-logic";

const SECRET = "test-secret";

describe("page-level org resolution uses resolveOrgId(), not caller.orgId", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.IMPERSONATION_COOKIE_SECRET = SECRET;
    rpcMock.mockResolvedValue({ data: [testMembershipRow({ org_id: "yuvabe-org" })], error: null });
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

describe("caller context membership read", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cookieStore.get.mockReturnValue(undefined);
  });

  it("rejects when the access read fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { resolveCallerContext } = await import("@/lib/dal");
    await expect(resolveCallerContext()).rejects.toMatchObject({ message: "boom" });
  });

  it("rejects when the user belongs to more than one agency", async () => {
    rpcMock.mockResolvedValue({
      data: [testMembershipRow({ org_id: "a" }), testMembershipRow({ org_id: "b" })],
      error: null,
    });
    const { resolveCallerContext } = await import("@/lib/dal");
    await expect(resolveCallerContext()).rejects.toThrow("Belonging to more than one agency is not supported yet.");
  });

  it("redirects (or returns null) when there is no membership", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { resolveCallerContext, resolveCallerContextOrNull } = await import("@/lib/dal");
    await expect(resolveCallerContext()).rejects.toThrow("REDIRECT /login?error=no-membership");
    await expect(resolveCallerContextOrNull()).resolves.toBeNull();
  });

  it("builds the caller's access from a member row", async () => {
    rpcMock.mockResolvedValue({
      data: [testMembershipRow({ org_id: "org-7", is_owner: false, permissions: ["view"], clients: [{ client_id: "c1", permissions: ["view"] }] })],
      error: null,
    });
    const { resolveCallerContext } = await import("@/lib/dal");
    const caller = await resolveCallerContext();
    expect(caller.orgId).toBe("org-7");
    const org = caller.access.orgs.get("org-7");
    expect(org?.isOwner).toBe(false);
    expect(org?.clients.get("c1")?.has("view")).toBe(true);
    // The mocked session is a super admin's (app_metadata.platform_role).
    expect(caller.access.isSuperAdmin).toBe(true);
  });
});

describe("one session read per render", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cookieStore.get.mockReturnValue(undefined);
    rpcMock.mockResolvedValue({ data: [testMembershipRow({ org_id: "yuvabe-org" })], error: null });
    // React's cache() does not memoize outside a render, so stand in a simple memoizer.
    vi.doMock("react", async (orig) => ({
      ...(await orig<typeof import("react")>()),
      cache: <A extends unknown[], R>(fn: (...a: A) => R) => {
        const seen = new Map<string, R>();
        return (...a: A) => {
          const k = JSON.stringify(a);
          if (!seen.has(k)) seen.set(k, fn(...a));
          return seen.get(k) as R;
        };
      },
    }));
  });

  it("reads the session once when both resolvers run", async () => {
    const { resolveCallerContext, resolveCallerContextOrNull } = await import("@/lib/dal");
    await resolveCallerContextOrNull();
    await resolveCallerContext();
    expect(getUserWithRetry).toHaveBeenCalledTimes(1);
  });
});

// Strips `//` line comments before the caller.orgId check below, so a file's own
// explanatory prose can't produce a false positive — the check cares about actual usage,
// not the string appearing in a comment about why it was deliberately avoided.
function stripLineComments(source: string): string {
  // [^\r\n]* (not `.*` anchored on `$`) so this also works on CRLF line endings —
  // `.` excludes line terminators, so a trailing \r before \n stops `.*$` from ever
  // reaching the anchor and silently no-ops the strip.
  return source.replace(/\/\/[^\r\n]*/g, "");
}

describe("every org-scoped page resolves its org via resolveOrgId(), not caller.orgId", () => {
  const pageFiles = [
    "src/app/(home)/page.tsx",
    "src/app/clients/[id]/(canvases)/page.tsx",
    "src/app/clients/[id]/kb/page.tsx",
    "src/app/clients/[id]/canvases/[cid]/(canvas)/page.tsx",
    "src/app/clients/[id]/canvases/[cid]/edit/page.tsx",
    "src/app/eval/[canvasId]/page.tsx",
  ];

  for (const relPath of pageFiles) {
    it(`${relPath} calls resolveOrgId(), not caller.orgId, for org scoping`, () => {
      const source = readFileSync(join(process.cwd(), relPath), "utf8");
      expect(/\bresolveOrgId\(|\bloadClientPage\(|\bloadCanvasPage\(|\bresolveActingCaller\(/.test(stripLineComments(source))).toBe(true);
      // A page using caller.orgId for org-scoping (not some other field) is exactly
      // the C1 regression — this substring check is deliberately blunt, matching the
      // action-coverage test's own philosophy: cheap, source-level, and it fails loudly
      // the moment the wiring reverts, regardless of whether resolveOrgId() itself
      // still works correctly in isolation.
      expect(stripLineComments(source)).not.toMatch(/caller\.orgId/);
    });
  }
});
