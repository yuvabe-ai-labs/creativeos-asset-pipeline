"use server";

import { saveCanvasNodes, listNodes, type PersistedNode } from "@/lib/db/nodes";
import { saveCanvasEdges, listEdges } from "@/lib/db/edges";
import { getCanvasUpdatedAt } from "@/lib/db/canvases";
import { updateActiveVersionOutput } from "@/lib/db/versions";
import { nodeRowToFlow, type AppNode } from "@/lib/canvas-nodes";
import type { Edge } from "@xyflow/react";

export async function saveCanvasNodesAction(
  canvasId: string,
  nodes: PersistedNode[],
) {
  await saveCanvasNodes(canvasId, nodes);
}

// Combined, conflict-aware autosave (D32). Uses canvases.updated_at as an optimistic
// token. Writes my edits regardless (safe per D31, so another session's added nodes
// survive); on a token mismatch it refetches and returns the merged canvas — which,
// because my write already landed, is exactly mine ∪ their additions.
export async function saveCanvasAction(
  canvasId: string,
  payload: {
    nodes: PersistedNode[];
    edges: Edge[];
    removedNodeIds: string[];
    removedEdgeIds: string[];
    expectedUpdatedAt: string;
  },
): Promise<
  | { conflict: false; updatedAt: string }
  | { conflict: true; updatedAt: string; fresh: { nodes: AppNode[]; edges: Edge[] } }
> {
  const current = await getCanvasUpdatedAt(canvasId);
  const conflict = current !== payload.expectedUpdatedAt;

  await saveCanvasNodes(canvasId, payload.nodes, payload.removedNodeIds);
  await saveCanvasEdges(canvasId, payload.edges, payload.removedEdgeIds);

  const updatedAt = (await getCanvasUpdatedAt(canvasId)) ?? current ?? "";

  if (conflict) {
    const [rows, edges] = await Promise.all([listNodes(canvasId), listEdges(canvasId)]);
    return {
      conflict: true,
      updatedAt,
      fresh: { nodes: rows.map(nodeRowToFlow), edges },
    };
  }
  return { conflict: false, updatedAt };
}

// Save manual edits to the Script node's parsed output (D19): updates the
// active version's output in place — does NOT create a new version.
export async function saveScriptOutputAction(nodeId: string, output: unknown) {
  await updateActiveVersionOutput(nodeId, output);
}

// Save manual edits to the Prompt node's generated output (D19): updates the
// active version's output in place — does NOT create a new version.
export async function savePromptOutputAction(nodeId: string, output: unknown) {
  await updateActiveVersionOutput(nodeId, output);
}
