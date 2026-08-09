"use server";

import { saveCanvasNodes, type PersistedNode } from "@/lib/db/nodes";
import { saveCanvasEdges } from "@/lib/db/edges";
import { getCanvasLockHolder } from "@/lib/db/canvas-lock";
import { updateActiveVersionOutput } from "@/lib/db/versions";
import type { Edge } from "@xyflow/react";
import { withAction } from "@/lib/actions/with-action";

export async function saveCanvasNodesAction(
  canvasId: string,
  nodes: PersistedNode[],
) {
  return withAction("saveCanvasNodesAction", async () => {
    await saveCanvasNodes(canvasId, nodes);
  });
}

// D33: server-enforced autosave. Writes only if the caller holds the lock; otherwise
// returns lockLost and writes nothing. (Replaces D32's optimistic merge — single writer,
// so no conflict to reconcile.) D31 non-destructive deletes are unchanged.
export async function saveCanvasAction(
  canvasId: string,
  payload: {
    nodes: PersistedNode[];
    edges: Edge[];
    removedNodeIds: string[];
    removedEdgeIds: string[];
    sessionId: string;
  },
): Promise<{ ok: true } | { ok: false; lockLost: true }> {
  return withAction("saveCanvasAction", async () => {
    const holder = await getCanvasLockHolder(canvasId);
    if (holder !== payload.sessionId) return { ok: false, lockLost: true };

    await saveCanvasNodes(canvasId, payload.nodes, payload.removedNodeIds);
    await saveCanvasEdges(canvasId, payload.edges, payload.removedEdgeIds);
    return { ok: true };
  });
}

// Save manual edits to the Script node's parsed output (D19): updates the
// active version's output in place — does NOT create a new version.
export async function saveScriptOutputAction(nodeId: string, output: unknown) {
  return withAction("saveScriptOutputAction", async () => {
    await updateActiveVersionOutput(nodeId, output);
  });
}

// Save manual edits to the Prompt node's generated output (D19): updates the
// active version's output in place — does NOT create a new version.
export async function savePromptOutputAction(nodeId: string, output: unknown) {
  return withAction("savePromptOutputAction", async () => {
    await updateActiveVersionOutput(nodeId, output);
  });
}
