"use server";

import { saveCanvasNodes, type PersistedNode } from "@/lib/db/nodes";
import { saveCanvasEdges } from "@/lib/db/edges";
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
