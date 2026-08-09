import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

// vi.hoisted() required for every value a vi.mock() factory below closes over — mock
// factories are hoisted above plain top-level const/let declarations (same gotcha
// documented in Tasks 4 and 6's test files).
const { cookieJar, cookieStore, auditRows, liveRoleBox } = vi.hoisted(() => {
  const jar = new Map<string, { value: string }>();
  return {
    cookieJar: jar,
    cookieStore: {
      get: vi.fn((name: string) => jar.get(name)),
      set: vi.fn((name: string, value: string) => jar.set(name, { value })),
      delete: vi.fn((name: string) => jar.delete(name)),
    },
    auditRows: [] as Record<string, unknown>[],
    liveRoleBox: { current: "super_admin" as "super_admin" | "member" },
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

vi.mock("@/lib/dal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dal")>("@/lib/dal");
  const callerContext = async () => ({
    userId: "op-1",
    email: "operator@yuvabe.com",
    platformRole: liveRoleBox.current,
    orgId: "yuvabe-org",
    orgRole: "owner",
    mustChangePassword: false,
  });
  return {
    ...actual,
    resolveCallerContext: vi.fn(callerContext),
    // resolveImpersonationState()'s live-role re-check (D81) now uses this non-redirecting
    // variant instead of resolveCallerContext — mock it the same way so the
    // "revoking platform_role mid-session" scenario still exercises the live check.
    resolveCallerContextOrNull: vi.fn(callerContext),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === "impersonation_audit_log") auditRows.push(row);
        return { error: null };
      },
      // startImpersonation's I3 org-existence check (getOrgById) queries this table —
      // "target-org" must resolve so these flow scenarios can still enter impersonation.
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => ({
            data:
              table === "organizations" && value === "target-org"
                ? {
                    id: "target-org",
                    name: "Target Org",
                    slug: "target-org",
                    monthly_credit_limit: null,
                    created_at: new Date().toISOString(),
                  }
                : null,
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", name: "Acme", org_id: "target-org" })),
}));

process.env.IMPERSONATION_COOKIE_SECRET = "test-secret";

import { startImpersonation, enterElevatedMode, endImpersonation, resolveImpersonationState } from "./impersonation";
import { withClient } from "@/lib/api/route-helpers";

const params = Promise.resolve({ id: "client-1" });
function req(method: string) {
  return new NextRequest("http://localhost/api/clients/client-1", { method });
}

describe("Stage 4 impersonation — checklist scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clear();
    auditRows.length = 0;
    liveRoleBox.current = "super_admin";
  });

  it("entering impersonation resolves the target org's data", async () => {
    await startImpersonation("target-org");
    const res = await withClient(req("GET"), params, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200); // client-1 belongs to target-org, so it resolves — not a 404
  });

  it("a write while non-elevated is blocked", async () => {
    await startImpersonation("target-org");
    const res = await withClient(req("POST"), params, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(403);
  });

  it("enter elevated -> write -> exit produces exactly 3 ordered audit rows", async () => {
    await startImpersonation("target-org");
    await enterElevatedMode();
    await withClient(req("POST"), params, async () => NextResponse.json({ ok: true }));
    await endImpersonation();

    expect(auditRows.map((r) => r.event_type)).toEqual([
      "session_started",
      "elevated_mode_entered",
      "write_action",
      "session_ended",
    ]);
  });

  it("revoking platform_role mid-session ends impersonation on the very next request", async () => {
    await startImpersonation("target-org");
    expect((await resolveImpersonationState()).isImpersonating).toBe(true);

    liveRoleBox.current = "member"; // operator demoted mid-session
    expect((await resolveImpersonationState()).isImpersonating).toBe(false);
  });

  it("exit clears the cookie", async () => {
    await startImpersonation("target-org");
    await endImpersonation();
    expect(cookieJar.has("impersonation")).toBe(false);
    expect((await resolveImpersonationState()).isImpersonating).toBe(false);
  });
});
