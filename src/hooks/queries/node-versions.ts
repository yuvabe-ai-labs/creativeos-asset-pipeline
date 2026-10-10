"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nodeVersionsService, type NodeVersionsResponse } from "@/services/node-versions.service";
import { useIdentity } from "@/hooks/use-identity";
import { subscribeToOrgVersionUpdates } from "@/lib/realtime/org-version-updates";
import { planVersionsCacheUpdate } from "@/lib/nodes/versions-cache-plan";

// A node's versions, through TanStack Query (CLAUDE.md, "Data fetching"). Every focus view reads
// its node's versions here, so closing and reopening one shows the cached list at once and
// revalidates behind it, and a node card can load them on hover before its view opens. The keys
// are built here and nowhere else.
export const nodeVersionKeys = {
  all: ["node-versions"] as const,
  list: (nodeId: string) => [...nodeVersionKeys.all, nodeId] as const,
};

// Short on purpose. Long enough that a hover-prefetch is reused by the open that follows it;
// short enough that reopening a view later re-checks anyway. While a view is open,
// useNodeVersionUpdates keeps it live; while closed, useNodeVersionsLiveSync drops a list the
// live channel says has changed.
const STALE_MS = 10_000;

function nodeVersionsQuery<V>(nodeId: string) {
  return {
    queryKey: nodeVersionKeys.list(nodeId),
    queryFn: () => nodeVersionsService.list<V>(nodeId),
    staleTime: STALE_MS,
  };
}

/** The node's versions while `enabled` (a focus view passes its `open`). */
export function useNodeVersions<V>(nodeId: string, enabled: boolean) {
  return useQuery({ ...nodeVersionsQuery<V>(nodeId), enabled: enabled && Boolean(nodeId) });
}

/** Re-read the node's versions now, store them in the cache and return them — for a view reacting
 *  to its own action (generate, restore, approve), which acts on the fresh result. Throws on a
 *  failed read, like the service.
 *
 *  Cancels a read already in flight first: TanStack would otherwise hand back that read's
 *  promise, and a read that started BEFORE the action (the re-check behind a reopen, say) would
 *  come back without it — the viewer's own decision missing from the screen they made it on. */
export function useRefreshNodeVersions<V>(nodeId: string) {
  const queryClient = useQueryClient();
  return useCallback(async (): Promise<NodeVersionsResponse<V>> => {
    await queryClient.cancelQueries({ queryKey: nodeVersionKeys.list(nodeId), exact: true });
    return queryClient.query({ ...nodeVersionsQuery<V>(nodeId), staleTime: 0 });
  }, [queryClient, nodeId]);
}

/** Point the cached list at a version right away — the one a generate just made, or a restore
 *  just selected — before the re-read confirms it, so the view never shows the old one meanwhile. */
export function useSetActiveNodeVersion(nodeId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (versionId: string | null) =>
      queryClient.setQueryData<NodeVersionsResponse<unknown>>(
        nodeVersionKeys.list(nodeId),
        (old: NodeVersionsResponse<unknown> | undefined) =>
          old ? { ...old, activeVersionId: versionId } : old,
      ),
    [queryClient, nodeId],
  );
}

/**
 * Keep the canvas's cached version lists honest while their views are CLOSED. An open view
 * refreshes itself (useNodeVersionUpdates); a closed one would otherwise reopen on a list from
 * before a generation finished or a reviewer decided in the drawer. Mount ONCE per canvas.
 * See planVersionsCacheUpdate for what each change does.
 *
 * `canvas` is read through a ref so a caller passing inline functions doesn't resubscribe.
 */
export function useNodeVersionsLiveSync(canvas: {
  isOnCanvas: (nodeId: string) => boolean;
  openFocusViewIds: () => readonly string[];
}) {
  const { orgId } = useIdentity();
  const queryClient = useQueryClient();
  const canvasRef = useRef(canvas);
  useEffect(() => {
    canvasRef.current = canvas;
  });

  useEffect(() => {
    if (!orgId) return;
    return subscribeToOrgVersionUpdates(orgId, (changedNodeId) => {
      const plan = planVersionsCacheUpdate({
        changedNodeId,
        isOnCanvas: canvasRef.current.isOnCanvas,
        openFocusViewIds: canvasRef.current.openFocusViewIds(),
        isShowing: (nodeId) =>
          queryClient.getQueryCache().find({ queryKey: nodeVersionKeys.list(nodeId), exact: true })
            ?.isActive() ?? false,
      });
      if (plan === "mark-all-stale") {
        void queryClient.invalidateQueries({ queryKey: nodeVersionKeys.all, refetchType: "none" });
        return;
      }
      if (plan === "ignore" || !changedNodeId) return;
      const filters = { queryKey: nodeVersionKeys.list(changedNodeId), exact: true };
      if (plan === "refetch") void queryClient.invalidateQueries(filters);
      else void queryClient.resetQueries(filters); // "drop": nothing is showing it
    });
  }, [orgId, queryClient]);
}

/** Start loading a node's versions ahead of its focus view opening (a node card's hover). A
 *  no-op while a fresh copy is already cached. */
export function usePrefetchNodeVersions() {
  const queryClient = useQueryClient();
  return useCallback(
    // Best-effort: a failed prefetch just means the view reads on open, as it would anyway.
    (nodeId: string) => queryClient.query(nodeVersionsQuery(nodeId)).catch(() => undefined),
    [queryClient],
  );
}
