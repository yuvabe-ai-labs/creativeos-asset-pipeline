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
