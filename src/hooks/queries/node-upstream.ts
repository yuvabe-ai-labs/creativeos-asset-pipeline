"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nodeUpstreamService, type NodeUpstream } from "@/services/node-upstream.service";

// What a Video Gen node is fed — its connected images and its prompt node — through TanStack
// Query (CLAUDE.md, "Data fetching"). The keys are built here and nowhere else.
//
// The cache is for SHOWING only. This data changes whenever anyone rewires the canvas, and the
// route walks PERSISTED edges, so the view never acts on a cached copy: it renders it at once,
// then flushes autosave and re-reads (useRefreshNodeUpstream), and only that confirmed read
// drives anything written back to the node (image roles, the multishot model) or Generate.
export const nodeUpstreamKeys = {
  detail: (nodeId: string) => ["node-upstream", nodeId] as const,
};

function nodeUpstreamQuery(nodeId: string) {
  return {
    queryKey: nodeUpstreamKeys.detail(nodeId),
    queryFn: () => nodeUpstreamService.get(nodeId),
    // A hover-prefetch is reused by the open that follows it; the open re-reads regardless.
    staleTime: 10_000,
  };
}

/** The cached upstream, if any — never fetches by itself (enabled: false). The view fetches
 *  through useRefreshNodeUpstream, after the autosave flush the route depends on; a read made
 *  before it could cache pre-change wiring as if it were current. */
export function useNodeUpstream(nodeId: string) {
  return useQuery({ ...nodeUpstreamQuery(nodeId), enabled: false });
}

/** Re-read the node's upstream now, cache it and return it. Cancels a read already in flight,
 *  which may have started before the wiring change this read exists to see. Throws on failure. */
export function useRefreshNodeUpstream(nodeId: string) {
  const queryClient = useQueryClient();
  return useCallback(async (): Promise<NodeUpstream> => {
    await queryClient.cancelQueries({ queryKey: nodeUpstreamKeys.detail(nodeId), exact: true });
    return queryClient.query({ ...nodeUpstreamQuery(nodeId), staleTime: 0 });
  }, [queryClient, nodeId]);
}

/** Start loading a node's upstream ahead of its view opening (a node card's hover), so the rail
 *  has something to show at once. A no-op while a fresh copy is cached. */
export function usePrefetchNodeUpstream() {
  const queryClient = useQueryClient();
  return useCallback(
    // Best-effort: a failed prefetch just means the view reads on open, as it would anyway.
    (nodeId: string) => queryClient.query(nodeUpstreamQuery(nodeId)).catch(() => undefined),
    [queryClient],
  );
}
