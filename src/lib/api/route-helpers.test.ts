import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.unmock("@/lib/permissions/server");

const { callerHolder } = vi.hoisted(() => ({ callerHolder: { access: null as unknown } }));
vi.mock("@/lib/dal", async () => {
  const { testOwnerAccess } = await import("@/lib/permissions/test-fixtures");
  return {
    resolveCallerContext: vi.fn(async () => ({
      userId: "user-1",
      email: "user-1@yuvabe.com",
      platformRole: "member",
      orgId: "org-1",
      orgRole: "owner",
      mustChangePassword: false,
      access: callerHolder.access ?? testOwnerAccess(),
    })),
  };
});

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
const { nodeOrgIdHolder, nodeQueryGate, selects } = vi.hoisted(() => ({
  nodeOrgIdHolder: { orgId: "org-1" },
  // The select string each table was read with (withMoodboard must read client_id).
  selects: {} as Record<string, string>,
  // When set, the node lookup stays pending until this promise settles — lets a test
  // observe what withNode does WHILE that query is still in flight.
  nodeQueryGate: { wait: null as Promise<void> | null },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: (table: string) => {
      // withCanvas and withMoodboard: canvas-1 / board-1 sit under client-1 in nodeOrgIdHolder's org.
      if (table === "canvases" || table === "moodboards") {
        const row = table === "canvases"
          ? { id: "canvas-1", client_id: "client-1", name: "Reel", clients: { org_id: nodeOrgIdHolder.orgId } }
          : { id: "board-1", client_id: "client-1", clients: [{ org_id: nodeOrgIdHolder.orgId }] };
        return {
          select: (cols: string) => {
            selects[table] = cols;
            return { eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) };
          },
        };
      }
      if (table === "nodes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (nodeQueryGate.wait) await nodeQueryGate.wait;
                return {
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
                };
              },
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in mock: ${table}`);
    },
  })),
}));

import { resolveCallerContext } from "@/lib/dal";
import { testAccess } from "@/lib/permissions/test-fixtures";
import { withCanvas, withClient, withMoodboard, withNode, withAccess } from "./route-helpers";

const params = Promise.resolve({ id: "client-1" });
function req(method: string) {
  return new NextRequest("http://localhost/api/clients/client-1", { method });
}

const nodeParams = Promise.resolve({ id: "node-1" });
function nodeReq(method: string) {
  return new NextRequest("http://localhost/api/nodes/node-1/generate", { method });
}

describe("withClient write-gating", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    callerHolder.access = null;
  });

  it("allows GET when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("GET"), params, { need: "scripts.view" }, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("allows POST when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("blocks POST when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, handler);
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows GET even when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("GET"), params, { need: "scripts.view" }, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("allows POST when impersonating and elevated, and logs a write_action", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, handler);
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
    await withClient(req("POST"), params, { need: "scripts.edit" }, vi.fn(async () => NextResponse.json(null, { status: 200 })));
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
    callerHolder.access = null;
    nodeOrgIdHolder.orgId = "org-1";
    nodeQueryGate.wait = null;
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("resolves the caller while the node lookup is still in flight, not after it", async () => {
    let release!: () => void;
    nodeQueryGate.wait = new Promise<void>((r) => (release = r));
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const pending = withNode(nodeReq("GET"), nodeParams, { need: "scripts.view" }, handler);
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveCallerContext).toHaveBeenCalled();
    release();
    expect((await pending).status).toBe(200);
  });

  it("resolves the caller exactly once per request", async () => {
    // React's cache() does not dedupe inside route handlers, so going through
    // resolveOrgId() as well would re-run the Auth-server check and membership read.
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    await withNode(nodeReq("GET"), nodeParams, { need: "scripts.view" }, handler);
    expect(resolveCallerContext).toHaveBeenCalledTimes(1);
  });

  it("not impersonating: effectiveOrgId equals the caller's own org", async () => {
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withNode(nodeReq("POST"), nodeParams, { need: "scripts.edit" }, handler);
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
    nodeOrgIdHolder.orgId = "org-2";
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-2", elevated: true,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withNode(nodeReq("POST"), nodeParams, { need: "scripts.edit" }, handler);
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
    nodeOrgIdHolder.orgId = "org-2";
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-2", elevated: false,
    });
    const handler = vi.fn(async () => NextResponse.json(null, { status: 200 }));
    const res = await withNode(nodeReq("GET"), nodeParams, { need: "scripts.view" }, handler);
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

describe("withClient guard (D490)", () => {
  beforeEach(() => {
    callerHolder.access = null;
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("runs the handler when the caller holds the permission for this client", async () => {
    callerHolder.access = testAccess({ keys: ["scripts.edit"], clientIds: ["client-1"] });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith("client-1", expect.objectContaining({ id: "client-1" }), expect.objectContaining({ userId: "user-1" }), "org-1");
  });

  it("answers 404 for a client outside the caller's list, exactly like a foreign agency", async () => {
    callerHolder.access = testAccess({ keys: ["scripts.edit"], clientIds: ["other-client"] });
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Client not found." });
  });

  it("answers 403 with the agreed copy when the tick is missing", async () => {
    callerHolder.access = testAccess({ keys: ["scripts.view"] });
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You don't have access to this. Ask your agency owner." });
  });

  it("acts as owner while impersonating the client's agency", async () => {
    callerHolder.access = testAccess({ keys: [] });
    resolveImpersonationStateMock.mockResolvedValueOnce({ isImpersonating: true, operatorId: "op", targetOrgId: "org-1", elevated: false });
    const res = await withClient(req("GET"), params, { need: "scripts.view" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });
});

describe("withNode guard", () => {
  beforeEach(() => {
    callerHolder.access = null;
    nodeOrgIdHolder.orgId = "org-1";
    nodeQueryGate.wait = null;
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("checks the node's client scope", async () => {
    callerHolder.access = testAccess({ keys: ["canvases.view"], clientIds: ["someone-else"] });
    const res = await withNode(req("GET"), Promise.resolve({ id: "node-1" }), { need: "canvases.view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
  });

  it("refuses a missing generate tick with 403", async () => {
    callerHolder.access = testAccess({ keys: ["canvases.view"] });
    const res = await withNode(req("POST"), Promise.resolve({ id: "node-1" }), { need: "video_generation.generate" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
  });
});

describe("withCanvas guard", () => {
  const canvasParams = () => Promise.resolve({ id: "canvas-1" });
  beforeEach(() => {
    callerHolder.access = null;
    nodeOrgIdHolder.orgId = "org-1";
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("hands the handler the canvas, the caller and the agency acted in", async () => {
    callerHolder.access = testAccess({ keys: ["canvases.view"], clientIds: ["client-1"] });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withCanvas(req("GET"), canvasParams(), { need: "canvases.view" }, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith("canvas-1", { id: "canvas-1", client_id: "client-1", name: "Reel" }, expect.objectContaining({ userId: "user-1" }), "org-1");
  });

  it("answers 404 for a canvas whose client is outside the caller's list", async () => {
    callerHolder.access = testAccess({ keys: ["canvases.view"], clientIds: ["other-client"] });
    const handler = vi.fn(async () => NextResponse.json({}));
    const res = await withCanvas(req("GET"), canvasParams(), { need: "canvases.view" }, handler);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Canvas not found." });
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 404 for another agency's canvas", async () => {
    nodeOrgIdHolder.orgId = "org-2";
    const res = await withCanvas(req("GET"), canvasParams(), { need: "canvases.view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
  });

  it("answers 403 with the agreed copy when the tick is missing", async () => {
    callerHolder.access = testAccess({ keys: ["canvases.view"] });
    const res = await withCanvas(req("POST"), canvasParams(), { need: "canvases.edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You don't have access to this. Ask your agency owner." });
  });

  it("passes the impersonated agency as the one acted in", async () => {
    nodeOrgIdHolder.orgId = "target-org";
    resolveImpersonationStateMock.mockResolvedValueOnce({ isImpersonating: true, operatorId: "op", targetOrgId: "target-org", elevated: false });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    await withCanvas(req("GET"), canvasParams(), { need: "canvases.view" }, handler);
    expect(handler).toHaveBeenCalledWith("canvas-1", expect.anything(), expect.anything(), "target-org");
  });
});

describe("withMoodboard guard", () => {
  beforeEach(() => {
    callerHolder.access = null;
    nodeOrgIdHolder.orgId = "org-1";
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("reads the board's client and hands the handler the caller and the agency acted in", async () => {
    callerHolder.access = testAccess({ keys: ["moodboards.view"], clientIds: ["client-1"] });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withMoodboard(req("GET"), "board-1", { need: "moodboards.view" }, handler);
    expect(res.status).toBe(200);
    expect(selects.moodboards).toContain("client_id");
    expect(handler).toHaveBeenCalledWith("board-1", expect.objectContaining({ userId: "user-1" }), "org-1");
  });

  it("answers 404 for a board whose client is outside the caller's list", async () => {
    callerHolder.access = testAccess({ keys: ["moodboards.view"], clientIds: ["other-client"] });
    const res = await withMoodboard(req("GET"), "board-1", { need: "moodboards.view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Moodboard not found." });
  });

  it("answers 403 with the agreed copy when the tick is missing", async () => {
    callerHolder.access = testAccess({ keys: ["moodboards.view"] });
    const res = await withMoodboard(req("POST"), "board-1", { need: "moodboards.edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You don't have access to this. Ask your agency owner." });
  });
});

describe("withAccess", () => {
  beforeEach(() => {
    callerHolder.access = null;
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("allows an agency key the caller holds", async () => {
    callerHolder.access = testAccess({ keys: ["clients.edit"] });
    const res = await withAccess(req("POST"), { need: "clients.edit" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });

  it("allows a client-scoped key held for at least one client", async () => {
    callerHolder.access = testAccess({ keys: ["voices.view"], clientIds: ["c-1"] });
    const res = await withAccess(req("GET"), { need: "voices.view" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });

  it("refuses without the key", async () => {
    callerHolder.access = testAccess({ keys: [] });
    const res = await withAccess(req("GET"), { need: "voices.view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
  });
});
