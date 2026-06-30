import { describe, it, expect, vi } from "vitest";
import { runAutosaveFlush } from "./autosave-flush";
import type { saveCanvasAction } from "@/lib/actions/nodes";

const snapshot = {
  nodes: [],
  edges: [],
  removedNodeIds: ["n9"],
  removedEdgeIds: [],
};

function deps(save: unknown, onSaved = vi.fn(), onMerge = vi.fn()) {
  return {
    canvasId: "c1",
    snapshot,
    expectedUpdatedAt: "T1",
    save: save as typeof saveCanvasAction,
    onSaved,
    onMerge,
  };
}

describe("runAutosaveFlush", () => {
  it("refreshes the token and reports flushed tombstones on a clean save", async () => {
    const save = vi.fn().mockResolvedValue({ conflict: false, updatedAt: "T2" });
    const onSaved = vi.fn();
    const onMerge = vi.fn();
    await runAutosaveFlush(deps(save, onSaved, onMerge));
    expect(onSaved).toHaveBeenCalledWith("T2", ["n9"], []);
    expect(onMerge).not.toHaveBeenCalled();
  });

  it("merges the fresh canvas on conflict", async () => {
    const fresh = { nodes: [], edges: [] };
    const save = vi.fn().mockResolvedValue({ conflict: true, updatedAt: "T3", fresh });
    const onSaved = vi.fn();
    const onMerge = vi.fn();
    await runAutosaveFlush(deps(save, onSaved, onMerge));
    expect(onSaved).toHaveBeenCalledWith("T3", ["n9"], []);
    expect(onMerge).toHaveBeenCalledWith(fresh);
  });

  it("swallows save errors (best-effort) and calls nothing", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const onSaved = vi.fn();
    await expect(runAutosaveFlush(deps(save, onSaved))).resolves.toBeUndefined();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
