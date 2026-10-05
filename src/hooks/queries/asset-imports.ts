"use client";

import { useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  assetImportsService,
  type AssetImportStatus,
  type ImportedAssetFilters,
  type ImportedAssetPage,
} from "@/services/asset-imports.service";
import { IMPORT_POLL_MS, type ImportSource } from "@/lib/asset-import/constants";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";
import type { AssetImport } from "@/lib/asset-import/types";

// D302 — brand asset imports through TanStack Query (D300). Two resources under one root: the
// polled import STATUS (small), and the PAGED assets (never polled — invalidated once when an
// import settles). The keys are built here and nowhere else.
export const assetImportKeys = {
  all: (clientId: string) => ["asset-imports", clientId] as const,
  status: (clientId: string) => [...assetImportKeys.all(clientId), "status"] as const,
  assetLists: (clientId: string) => [...assetImportKeys.all(clientId), "assets"] as const,
  assets: (clientId: string, filters: ImportedAssetFilters) =>
    [...assetImportKeys.assetLists(clientId), filters] as const,
};

export const isImportLive = (i: AssetImport) => JOB_LIVE_STATUSES.has(i.status);

/** Each source's latest import and the asset counts. Polled while any import is live. */
export function useAssetImports(clientId: string) {
  const query = useQuery({
    queryKey: assetImportKeys.status(clientId),
    queryFn: () => assetImportsService.status(clientId),
    enabled: Boolean(clientId),
    refetchInterval: (q) => (q.state.data?.imports.some(isImportLive) ? IMPORT_POLL_MS : false),
  });

  return query;
}

/** Imported assets, newest first, a page at a time (keyset cursor). Filters run on the server.
 *  The pages are never polled: when an import settles they are refetched once, so its assets
 *  appear without re-reading every page every few seconds. */
export function useImportedAssets(clientId: string, filters: ImportedAssetFilters) {
  const queryClient = useQueryClient();
  const status = useAssetImports(clientId);
  const liveKey = (status.data?.imports ?? []).filter(isImportLive).map((i) => i.id).join(",");
  const previousLive = useRef<string[] | null>(null);
  useEffect(() => {
    const before = previousLive.current;
    const now = liveKey ? liveKey.split(",") : [];
    previousLive.current = now;
    if (before && before.some((id) => !now.includes(id))) {
      void queryClient.invalidateQueries({ queryKey: assetImportKeys.assetLists(clientId) });
    }
  }, [liveKey, clientId, queryClient]);

  return useInfiniteQuery({
    queryKey: assetImportKeys.assets(clientId, filters),
    queryFn: ({ pageParam }) => assetImportsService.listAssets(clientId, filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ImportedAssetPage) => last.nextCursor ?? undefined,
    enabled: Boolean(clientId),
  });
}

/** Re-read the asset pages — the "new assets" pill while an import is still running. */
export function useRefreshImportedAssets(clientId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: assetImportKeys.assetLists(clientId) });
}

/** Start importing (all saved sources, or the ones given). Polling begins as soon as it returns. */
export function useStartAssetImport(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sources?: ImportSource[]) => assetImportsService.start(clientId, sources),
    onSuccess: (imports: AssetImport[]) => {
      queryClient.setQueryData<AssetImportStatus>(assetImportKeys.status(clientId), (old: AssetImportStatus | undefined) =>
        old ? { ...old, imports } : old,
      );
      void queryClient.invalidateQueries({ queryKey: assetImportKeys.status(clientId) });
    },
  });
}

/** Remove one imported asset — dropped from every cached page at once, restored on failure. */
export function useRemoveImportedAsset(clientId: string) {
  const queryClient = useQueryClient();
  const lists = assetImportKeys.assetLists(clientId);
  return useMutation({
    mutationFn: (assetId: string) => assetImportsService.removeAsset(clientId, assetId),
    onMutate: async (assetId: string) => {
      await queryClient.cancelQueries({ queryKey: lists });
      const previous = queryClient.getQueriesData<InfiniteData<ImportedAssetPage>>({ queryKey: lists });
      queryClient.setQueriesData<InfiniteData<ImportedAssetPage>>(
        { queryKey: lists },
        (old: InfiniteData<ImportedAssetPage> | undefined) =>
          old
            ? {
                ...old,
                pages: old.pages.map((p: ImportedAssetPage) => ({
                  ...p,
                  items: p.items.filter((a: { id: string }) => a.id !== assetId),
                })),
              }
            : old,
      );
      return { previous };
    },
    onError: (_e, _id, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    // The counts behind the filter chips.
    onSettled: () => queryClient.invalidateQueries({ queryKey: assetImportKeys.status(clientId) }),
  });
}
