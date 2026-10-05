"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assetImportsService, type AssetImportsPayload } from "@/services/asset-imports.service";
import { IMPORT_POLL_MS, type ImportSource } from "@/lib/asset-import/constants";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";
import type { AssetImport } from "@/lib/asset-import/types";

// D302 — imported brand assets and their per-source import status, through TanStack Query
// (D300). The keys are built here and nowhere else.
export const assetImportKeys = {
  all: (clientId: string) => ["asset-imports", clientId] as const,
};

export const isImportLive = (i: AssetImport) => JOB_LIVE_STATUSES.has(i.status);

/** Imports and imported assets. Polled while any source is still importing; once every import
 *  has settled, polling stops on its own and the last poll has brought the new assets in. */
export function useAssetImports(clientId: string) {
  return useQuery({
    queryKey: assetImportKeys.all(clientId),
    queryFn: () => assetImportsService.list(clientId),
    enabled: Boolean(clientId),
    refetchInterval: (query) => (query.state.data?.imports.some(isImportLive) ? IMPORT_POLL_MS : false),
  });
}

/** Start importing (all saved sources, or the ones given). Polling begins as soon as it returns. */
export function useStartAssetImport(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sources?: ImportSource[]) => assetImportsService.start(clientId, sources),
    onSuccess: (imports: AssetImport[]) => {
      queryClient.setQueryData<AssetImportsPayload>(assetImportKeys.all(clientId), (old: AssetImportsPayload | undefined) =>
        old ? { ...old, imports } : { imports, assets: [] },
      );
    },
  });
}

/** Remove one imported asset, dropping it from the cache at once. */
export function useRemoveImportedAsset(clientId: string) {
  const queryClient = useQueryClient();
  const key = assetImportKeys.all(clientId);
  return useMutation({
    mutationFn: (assetId: string) => assetImportsService.removeAsset(clientId, assetId),
    onMutate: async (assetId: string) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AssetImportsPayload>(key);
      queryClient.setQueryData<AssetImportsPayload>(key, (old: AssetImportsPayload | undefined) =>
        old ? { ...old, assets: old.assets.filter((a: { id: string }) => a.id !== assetId) } : old,
      );
      return { previous };
    },
    onError: (_e, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
  });
}
