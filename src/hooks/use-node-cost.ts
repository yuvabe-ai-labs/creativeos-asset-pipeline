"use client";

import { useCanvasId } from "@/components/canvas/canvas-id-context";
import { useNodeCredits } from "@/hooks/queries/canvas-cost";

// A node's settled credits — or, with upstreamNodeIds, its pipeline's — read off the canvas's
// one shared cost query rather than a request per node (every node card calls this). Kept live
// by useCanvasCostLiveUpdates, mounted once in Canvas. Null until the figures have loaded.
export function useNodeCost(nodeId: string, upstreamNodeIds?: string[]) {
  return useNodeCredits(useCanvasId(), nodeId, upstreamNodeIds);
}
