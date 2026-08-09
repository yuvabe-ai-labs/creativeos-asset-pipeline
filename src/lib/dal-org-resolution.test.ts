import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// Strips `//` line comments before the caller.orgId check below, so a file's own
// explanatory prose (e.g. eval/[canvasId]/page.tsx's "Uses resolveOrgId() (not
// caller.orgId) for consistency..." comment) can't produce a false positive — the
// check cares about actual usage, not the string appearing in a comment about why it
// was deliberately avoided.
function stripLineComments(source: string): string {
  // [^\r\n]* (not `.*` anchored on `$`) so this also works on CRLF line endings —
  // `.` excludes line terminators, so a trailing \r before \n stops `.*$` from ever
  // reaching the anchor and silently no-ops the strip.
  return source.replace(/\/\/[^\r\n]*/g, "");
}

describe("every org-scoped page resolves its org via resolveOrgId(), not caller.orgId", () => {
  const pageFiles = [
    "src/app/page.tsx",
    "src/app/clients/[id]/page.tsx",
    "src/app/clients/[id]/kb/page.tsx",
    "src/app/clients/[id]/canvases/[cid]/page.tsx",
    "src/app/eval/[canvasId]/page.tsx",
  ];

  for (const relPath of pageFiles) {
    it(`${relPath} calls resolveOrgId(), not caller.orgId, for org scoping`, () => {
      const source = readFileSync(join(process.cwd(), relPath), "utf8");
      expect(source).toContain("resolveOrgId()");
      // A page using caller.orgId for org-scoping (not some other field) is exactly
      // the C1 regression — this substring check is deliberately blunt, matching the
      // action-coverage test's own philosophy: cheap, source-level, and it fails loudly
      // the moment the wiring reverts, regardless of whether resolveOrgId() itself
      // still works correctly in isolation.
      expect(stripLineComments(source)).not.toMatch(/caller\.orgId/);
    });
  }
});
