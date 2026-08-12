import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1",
    email: "user-1@yuvabe.com",
    platformRole: "member",
    orgId: "org-1",
    orgRole: "owner",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));

// vi.mock factories are hoisted above top-level `const`s, so any variable a factory
// reads directly (not just closes over inside a nested function) must itself be
// declared via vi.hoisted() to avoid a TDZ ReferenceError at import time (same pattern
// as src/lib/auth/impersonation.test.ts).
const { resolveImpersonationStateMock, logMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(async (): Promise<
    { isImpersonating: false } | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean }
  > => ({ isImpersonating: false })),
  logMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));

vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", name: "Acme", org_id: "org-1" })),
}));

// withNode() resolves node -> canvas -> client -> org via a single embedded-join query on
// createServerSupabase(), not via @/lib/db/clients — mock it directly, matching the pattern
// used in src/app/api/nodes/[id]/file/drive/route.test.ts. nodeOrgIdHolder is mutable so
// individual tests can point the node at a different org (e.g. the impersonation target)
// without redeclaring the whole mock.
const { nodeOrgIdHolder } = vi.hoisted(() => ({ nodeOrgIdHolder: { orgId: "org-1" } }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: (table: string) => {
      if (table === "nodes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "node-1",
                  canvas_id: "canvas-1",
                  type: "prompt",
                  position: { x: 0, y: 0 },
                  data: {},
                  active_version_id: null,
                  created_at: "",
                  updated_at: "",
                  canvases: {
                    client_id: "client-1",
                    clients: { org_id: nodeOrgIdHolder.orgId },
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  })),
}));

import { resolveOrgId } from "@/lib/dal";
import { withClient, withNode } from "./route-helpers";

const params = Promise.resolve({ id: "client-1" });
function req(method: string) {
  return new NextRequest("http://localhost/api/clients/client-1", { method });
}

const nodeParams = Promise.resolve({ id: "node-1" });
function nodeReq(method: string) {
  return new NextRequest("http://localhost/api/nodes/node-1/generate", { method });
}

describe("withClient write-gating", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows GET when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("GET"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("allows POST when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("blocks POST when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows GET even when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("GET"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("allows POST when impersonating and elevated, and logs a write_action", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("POST"), params, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "org-1",
      eventType: "write_action",
      detail: { method: "POST", path: "/api/clients/client-1" },
    });
  });

  it("does not log write_action for a blocked write", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    await withClient(req("POST"), params, vi.fn(async () => NextResponse.json(null, { status: 200 })));
    expect(logMock).not.toHaveBeenCalled();
  });
});

// Regression coverage for the Stage 4 round-3 review finding: withNode() resolves
// effectiveOrgId (the impersonation target, when active) for its own isolation check, then
// used to hand the handler only the caller's real org via `caller` — silently dropping the
// resolved value on the floor. It now also passes effectiveOrgId as a 5th argument, and the
// four generation routes (and /api/me) were updated to bill/stamp that instead of
// caller.orgId. This suite proves withNode's own contract: the 5th argument is the
// EFFECTIVE org, which is NOT necessarily the caller's own org.
describe("withNode passes the resolved effectiveOrgId to its handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    nodeOrgIdHolder.orgId = "org-1";
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("not impersonating: effectiveOrgId equals the caller's own org", async () => {
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withNode(nodeReq("POST"), nodeParams, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      "node-1",
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
      "client-1",
      "org-1",
    );
  });

  it("impersonating + elevated: effectiveOrgId is the impersonation target, NOT the caller's own org", async () => {
    // The operator's real membership org (from resolveCallerContext) stays "org-1" — only
    // resolveOrgId (the isolation-check value) and the node's own org move to "org-2", the
    // impersonation target. This is the exact scenario the bug occurred in: withNode's
    // isolation check correctly resolves "org-2", but previously handed the handler
    // caller.orgId ("org-1") instead.
    vi.mocked(resolveOrgId).mockResolvedValue("org-2");
    nodeOrgIdHolder.orgId = "org-2";
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-2", elevated: true,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withNode(nodeReq("POST"), nodeParams, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      "node-1",
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }), // caller's real org — unchanged
      "client-1",
      "org-2", // effectiveOrgId — the impersonation target, not the caller's org
    );
  });

  it("GET is never write-gated, and still receives the resolved effectiveOrgId", async () => {
    vi.mocked(resolveOrgId).mockResolvedValue("org-2");
    nodeOrgIdHolder.orgId = "org-2";
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-2", elevated: false,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withNode(nodeReq("GET"), nodeParams, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      "node-1",
      expect.anything(),
      expect.anything(),
      "client-1",
      "org-2",
    );
  });
});
