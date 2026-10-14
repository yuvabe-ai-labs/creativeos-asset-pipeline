import { describe, it, expect, vi } from "vitest";
import type { Edge } from "@xyflow/react";
import { runAutosaveFlush, hasUnsavedChanges, savedBaseline } from "./autosave-flush";
import type { saveCanvasAction } from "@/lib/actions/nodes";
import type { AppNode } from "@/lib/canvas-nodes";

const snapshot = { nodes: [], edges: [], removedNodeIds: ["n9"], removedEdgeIds: [] };

function deps(save: unknown, onLockLost = vi.fn()) {
  return {
    canvasId: "c1",
    snapshot,
    sessionId: "s1",
    save: save as typeof saveCanvasAction,
    onLockLost,
  };
}

describe("runAutosaveFlush", () => {
  it("sends the snapshot with the sessionId and reports 'saved' on ok", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const onLockLost = vi.fn();
    await expect(runAutosaveFlush(deps(save, onLockLost))).resolves.toBe("saved");
    expect(save).toHaveBeenCalledWith("c1", { ...snapshot, sessionId: "s1" });
    expect(onLockLost).not.toHaveBeenCalled();
  });

  it("calls onLockLost and reports 'lock-lost' when the save is rejected", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, lockLost: true });
    const onLockLost = vi.fn();
    await expect(runAutosaveFlush(deps(save, onLockLost))).resolves.toBe("lock-lost");
    expect(onLockLost).toHaveBeenCalledTimes(1);
  });

  it("never throws, but REPORTS a save error (so deletion intent is not cleared)", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const onLockLost = vi.fn();
    await expect(runAutosaveFlush(deps(save, onLockLost))).resolves.toBe("error");
    expect(onLockLost).not.toHaveBeenCalled();
  });
});

describe("hasUnsavedChanges", () => {
  const node = {
    id: "n1",
    type: "prompt",
    position: { x: 0, y: 0 },
    data: { title: "Hook" },
  } as AppNode;
  const edge: Edge = { id: "e1", source: "n1", target: "n2" };
  const nodes = [node];
  const edges = [edge];
  const baseline = savedBaseline(nodes, edges);
  const clean = { nodes, edges, removedNodeIds: [], removedEdgeIds: [] };

  it("is clean when nodes and edges are the arrays last saved and nothing is pending deletion", () => {
    expect(hasUnsavedChanges(clean, baseline)).toBe(false);
  });

  it("is dirty when there is no saved baseline yet", () => {
    expect(hasUnsavedChanges(clean, null)).toBe(true);
  });

  it("is clean when only on-screen state changed — selecting or measuring a node", () => {
    // React Flow replaces the nodes array for these; none of it is persisted, so a save
    // would send exactly what the server already has.
    const touched = [{ ...node, selected: true, measured: { width: 280, height: 120 } }];
    expect(hasUnsavedChanges({ ...clean, nodes: touched }, baseline)).toBe(false);
    expect(hasUnsavedChanges({ ...clean, edges: [{ ...edge, selected: true }] }, baseline)).toBe(false);
  });

  it("is clean when only fields that are never persisted changed", () => {
    // flowToPersisted drops `parsed` and `approvalStatus` — they live on the version row.
    const patched = [{ ...node, data: { ...node.data, parsed: "out.png", approvalStatus: "approved" } }];
    expect(hasUnsavedChanges({ ...clean, nodes: patched as AppNode[] }, baseline)).toBe(false);
  });

  it("is dirty when a node moves", () => {
    expect(
      hasUnsavedChanges({ ...clean, nodes: [{ ...node, position: { x: 40, y: 0 } }] }, baseline),
    ).toBe(true);
  });

  it("is dirty when a node's persisted data changes", () => {
    const edited = [{ ...node, data: { title: "New hook" } }] as AppNode[];
    expect(hasUnsavedChanges({ ...clean, nodes: edited }, baseline)).toBe(true);
  });

  it("is dirty when a node or an edge is added", () => {
    const added = [...nodes, { ...node, id: "n2" }];
    expect(hasUnsavedChanges({ ...clean, nodes: added }, baseline)).toBe(true);
    expect(
      hasUnsavedChanges({ ...clean, edges: [...edges, { id: "e2", source: "n2", target: "n1" }] }, baseline),
    ).toBe(true);
  });

  it("is dirty while a node or edge deletion is still waiting to be persisted", () => {
    expect(hasUnsavedChanges({ ...clean, removedNodeIds: ["n1"] }, baseline)).toBe(true);
    expect(hasUnsavedChanges({ ...clean, removedEdgeIds: ["e1"] }, baseline)).toBe(true);
  });
});
