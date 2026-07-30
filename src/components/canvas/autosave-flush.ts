import type { PersistedNode } from "@/lib/db/nodes";
import type { Edge } from "@xyflow/react";
import type { saveCanvasAction } from "@/lib/actions/nodes";

export type AutosaveSnapshot = {
  nodes: PersistedNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
};

export type FlushOutcome = "saved" | "lock-lost" | "error";

// D33: server-enforced flush. Sends the snapshot + sessionId; if the server rejects
// (lock lost), notifies via onLockLost so the client flips to read-only. Never throws,
// but the outcome is REPORTED, not swallowed: the caller must not clear its pending
// deletion intent (removedNodeIds) unless this returns "saved" — a dropped error here
// once lost a 933-node delete silently (the mass-delete URL-overflow incident).
export async function runAutosaveFlush(deps: {
  canvasId: string;
  snapshot: AutosaveSnapshot;
  sessionId: string;
  save: typeof saveCanvasAction;
  onLockLost: () => void;
}): Promise<FlushOutcome> {
  const { canvasId, snapshot, sessionId, save, onLockLost } = deps;
  try {
    const result = await save(canvasId, { ...snapshot, sessionId });
    if (!result.ok) {
      onLockLost();
      return "lock-lost";
    }
    return "saved";
  } catch {
    return "error";
  }
}
