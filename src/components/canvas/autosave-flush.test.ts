import { describe, it, expect, vi } from "vitest";
import { runAutosaveFlush } from "./autosave-flush";
import type { saveCanvasAction } from "@/lib/actions/nodes";

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
  it("sends the snapshot with the sessionId and does nothing extra on ok", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const onLockLost = vi.fn();
    await runAutosaveFlush(deps(save, onLockLost));
    expect(save).toHaveBeenCalledWith("c1", { ...snapshot, sessionId: "s1" });
    expect(onLockLost).not.toHaveBeenCalled();
  });

  it("calls onLockLost when the save is rejected", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, lockLost: true });
    const onLockLost = vi.fn();
    await runAutosaveFlush(deps(save, onLockLost));
    expect(onLockLost).toHaveBeenCalledTimes(1);
  });

  it("swallows save errors (best-effort) and does not call onLockLost", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const onLockLost = vi.fn();
    await expect(runAutosaveFlush(deps(save, onLockLost))).resolves.toBeUndefined();
    expect(onLockLost).not.toHaveBeenCalled();
  });
});
