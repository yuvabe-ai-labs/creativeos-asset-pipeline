"use server";

import { saveCanvasNodes, type PersistedNode } from "@/lib/db/nodes";
import { saveCanvasEdges } from "@/lib/db/edges";
import { updateActiveVersionOutput } from "@/lib/db/versions";
import type { Edge } from "@xyflow/react";

export async function saveCanvasNodesAction(
  canvasId: string,
  nodes: PersistedNode[],
) {
  await saveCanvasNodes(canvasId, nodes);
}

export async function saveCanvasEdgesAction(
  canvasId: string,
  edges: Edge[],
) {
  await saveCanvasEdges(canvasId, edges);
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
