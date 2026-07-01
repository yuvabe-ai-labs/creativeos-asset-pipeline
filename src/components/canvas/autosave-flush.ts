import type { PersistedNode } from "@/lib/db/nodes";
import type { Edge } from "@xyflow/react";
import type { saveCanvasAction } from "@/lib/actions/nodes";

export type AutosaveSnapshot = {
  nodes: PersistedNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
};

// D33: server-enforced flush. Sends the snapshot + sessionId; if the server rejects
// (lock lost), notifies via onLockLost so the client flips to read-only. Best-effort:
// errors are swallowed.
export async function runAutosaveFlush(deps: {
  canvasId: string;
  snapshot: AutosaveSnapshot;
  sessionId: string;
  save: typeof saveCanvasAction;
  onLockLost: () => void;
}): Promise<void> {
  const { canvasId, snapshot, sessionId, save, onLockLost } = deps;
  try {
    const result = await save(canvasId, { ...snapshot, sessionId });
    if (!result.ok) onLockLost();
  } catch {
    // best-effort autosave — swallow
  }
}
