import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { saveNodesMock, saveEdgesMock, lockHolderMock, resolveTargetMock, resolveActingCallerMock } = vi.hoisted(() => ({
  saveNodesMock: vi.fn(async () => undefined),
  saveEdgesMock: vi.fn(async () => undefined),
  lockHolderMock: vi.fn(async () => "session-1"),
  resolveTargetMock: vi.fn(),
  resolveActingCallerMock: vi.fn(),
}));
vi.mock("@/lib/db/nodes", () => ({ saveCanvasNodes: saveNodesMock }));
vi.mock("@/lib/db/edges", () => ({ saveCanvasEdges: saveEdgesMock }));
vi.mock("@/lib/db/canvas-lock", () => ({ getCanvasLockHolder: lockHolderMock }));
vi.mock("@/lib/db/versions", () => ({ updateActiveVersionOutput: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
// The real guard runs; only the acting caller and the target row are stubbed.
vi.mock("@/lib/permissions/targets", () => ({ resolveTarget: resolveTargetMock }));
vi.mock("@/lib/permissions/server", async (orig) => ({
  ...(await orig<typeof import("@/lib/permissions/server")>()),
  resolveActingCaller: resolveActingCallerMock,
}));

import { testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { saveCanvasAction, saveCanvasNodesAction } from "./nodes";

const payload = {
  nodes: [{ id: "n-foreign", type: "text", position: { x: 0, y: 0 }, data: {} }],
  edges: [{ id: "e1", source: "n-foreign", target: "n2" }],
  removedNodeIds: [],
  removedEdgeIds: [],
  sessionId: "session-1",
};

// Migration 0062's nodes_keep_canvas / edges_keep_canvas refuse a row from another canvas. The
// save must fail with that error, never report success with the foreign row skipped.
const triggerRefusal = Object.assign(new Error("A node cannot move to another canvas"), { code: "23514" });

describe("canvas saves refused by the database", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockHolderMock.mockResolvedValue("session-1");
    resolveActingCallerMock.mockResolvedValue({
      caller: { userId: "u1", orgId: "org-1", access: testOwnerAccess() },
      effectiveOrgId: "org-1",
      impersonation: { isImpersonating: false },
    });
    resolveTargetMock.mockResolvedValue({ clientId: "c1", orgId: "org-1" });
  });

  it("saveCanvasAction fails, and saves no edges, when a node is refused", async () => {
    saveNodesMock.mockRejectedValueOnce(triggerRefusal);
    await expect(saveCanvasAction("cv-1", payload)).rejects.toBe(triggerRefusal);
    expect(saveEdgesMock).not.toHaveBeenCalled();
  });

  it("saveCanvasAction fails when an edge is refused", async () => {
    const edgeRefusal = new Error("An edge must join two nodes on its own canvas");
    saveEdgesMock.mockRejectedValueOnce(edgeRefusal);
    await expect(saveCanvasAction("cv-1", payload)).rejects.toBe(edgeRefusal);
  });

  it("saveCanvasNodesAction fails when a node is refused", async () => {
    saveNodesMock.mockRejectedValueOnce(triggerRefusal);
    await expect(saveCanvasNodesAction("cv-1", payload.nodes)).rejects.toBe(triggerRefusal);
  });

  it("writes to the canvas the guard checked", async () => {
    await expect(saveCanvasAction("cv-1", payload)).resolves.toEqual({ ok: true });
    expect(resolveTargetMock).toHaveBeenCalledWith({ canvasId: "cv-1" });
    expect(saveNodesMock).toHaveBeenCalledWith("cv-1", payload.nodes, []);
    expect(saveEdgesMock).toHaveBeenCalledWith("cv-1", payload.edges, []);
  });
});
