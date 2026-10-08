"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { canvasCostService } from "@/services/canvas-cost.service";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgGenerationUpdates } from "@/lib/realtime/org-generation-updates";
import { sumNodeCredits, type CanvasCost } from "@/lib/credits/canvas-cost";

// A canvas's settled spend, through TanStack Query (CLAUDE.md, "Data fetching"). One query per
// canvas serves the header chip, every node card's footer and every Usage popover. The keys are
// built here and nowhere else.
export const canvasCostKeys = {
  detail: (canvasId: string) => ["canvas-cost", canvasId] as const,
};

// Kept fresh by useCanvasCostLiveUpdates below rather than by refetching on every mount (hence
// the long staleTime): node cards and popovers mount and unmount constantly, and each would
// otherwise re-ask.
function canvasCostQuery(canvasId: string) {
  return {
    queryKey: canvasCostKeys.detail(canvasId),
    queryFn: () => canvasCostService.get(canvasId),
    enabled: Boolean(canvasId),
    staleTime: 60_000,
  };
}

/** The canvas's total and per-node breakdown. */
export function useCanvasCost(canvasId: string) {
  return useQuery(canvasCostQuery(canvasId));
}

/** One node's settled spend — or, with `alsoNodeIds`, its whole pipeline's (the node plus the
 *  nodes feeding it). Null until the canvas's figures have loaded. */
export function useNodeCredits(canvasId: string, nodeId: string, alsoNodeIds?: string[]) {
  const ids = [nodeId, ...(alsoNodeIds ?? [])];
  const { data } = useQuery({
    ...canvasCostQuery(canvasId),
    select: (cost: CanvasCost) => sumNodeCredits(cost.byNode, ids),
  });
  return data ?? null;
}

/**
 * Refetch the canvas's figures once a generation on it settles — otherwise every cost on screen
 * is stuck at its pre-generation value (YUV-250). Mount ONCE per canvas: one listener, one
 * refetch, however many readers there are.
 *
 * `isOnCanvas` scopes the org-wide event to this canvas. It has to come from the client's own
 * canvas state: `nodes` has RLS with no policies (0017_default_deny_rls.sql), so the browser
 * cannot ask the database which canvas a node is on.
 */
export function useCanvasCostLiveUpdates(canvasId: string, isOnCanvas: (nodeId: string) => boolean) {
  const { orgId } = useIdentity();
  const queryClient = useQueryClient();
  // Read through a ref so a caller passing an inline function doesn't resubscribe every render.
  const isOnCanvasRef = useRef(isOnCanvas);
  useEffect(() => {
    isOnCanvasRef.current = isOnCanvas;
  });

  useEffect(() => {
    if (!orgId || !canvasId) return;
    return subscribeToOrgGenerationUpdates(orgId, (row) => {
      if (row.status !== "succeeded" || !row.node_id || !isOnCanvasRef.current(row.node_id)) return;
      void queryClient.invalidateQueries({ queryKey: canvasCostKeys.detail(canvasId) });
    });
  }, [orgId, canvasId, queryClient]);
}
