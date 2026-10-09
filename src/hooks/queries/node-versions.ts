"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nodeVersionsService, type NodeVersionsResponse } from "@/services/node-versions.service";

// A node's versions, through TanStack Query (CLAUDE.md, "Data fetching"). Every focus view reads
// its node's versions here, so closing and reopening one shows the cached list at once and
// revalidates behind it, and a node card can load them on hover before its view opens. The keys
// are built here and nowhere else.
export const nodeVersionKeys = {
  all: ["node-versions"] as const,
  list: (nodeId: string) => [...nodeVersionKeys.all, nodeId] as const,
};

// Short on purpose. Long enough that a hover-prefetch is reused by the open that follows it;
// short enough that reopening a view later re-checks — someone else may have generated or
// reviewed while it was closed. While a view is open, useNodeVersionUpdates keeps it live.
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
 *  failed read, like the service. */
export function useRefreshNodeVersions<V>(nodeId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (): Promise<NodeVersionsResponse<V>> =>
      queryClient.fetchQuery({ ...nodeVersionsQuery<V>(nodeId), staleTime: 0 }),
    [queryClient, nodeId],
  );
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

/** Start loading a node's versions ahead of its focus view opening (a node card's hover). A
 *  no-op while a fresh copy is already cached. */
export function usePrefetchNodeVersions() {
  const queryClient = useQueryClient();
  return useCallback(
    (nodeId: string) => queryClient.prefetchQuery(nodeVersionsQuery(nodeId)),
    [queryClient],
  );
}
