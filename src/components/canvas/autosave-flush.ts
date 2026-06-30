import type { PersistedNode } from "@/lib/db/nodes";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { saveCanvasAction } from "@/lib/actions/nodes";

export type AutosaveSnapshot = {
  nodes: PersistedNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
};

// Pure autosave flush: send the snapshot via `save`, then report results back through
// callbacks. No React, no store — so it is unit-testable with a fake `save`. Errors are
// swallowed (autosave is best-effort).
export async function runAutosaveFlush(deps: {
  canvasId: string;
  snapshot: AutosaveSnapshot;
  expectedUpdatedAt: string;
  save: typeof saveCanvasAction;
  onSaved: (updatedAt: string, flushedNodeIds: string[], flushedEdgeIds: string[]) => void;
  onMerge: (fresh: { nodes: AppNode[]; edges: Edge[] }) => void;
}): Promise<void> {
  const { canvasId, snapshot, expectedUpdatedAt, save, onSaved, onMerge } = deps;
  try {
    const result = await save(canvasId, {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      removedNodeIds: snapshot.removedNodeIds,
      removedEdgeIds: snapshot.removedEdgeIds,
      expectedUpdatedAt,
    });
    onSaved(result.updatedAt, snapshot.removedNodeIds, snapshot.removedEdgeIds);
    if (result.conflict) onMerge(result.fresh);
  } catch {
    // best-effort autosave — swallow
  }
}
