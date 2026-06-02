"use server";

import { saveCanvasNodes, type PersistedNode } from "@/lib/db/nodes";

// Called (debounced) from the canvas whenever nodes change.
export async function saveCanvasNodesAction(
  canvasId: string,
  nodes: PersistedNode[],
) {
  await saveCanvasNodes(canvasId, nodes);
}
