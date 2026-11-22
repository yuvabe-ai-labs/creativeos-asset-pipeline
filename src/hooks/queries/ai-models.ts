"use client";

import { useQuery } from "@tanstack/react-query";
import { aiModelsService } from "@/services/ai-models.service";
import { currentPrice } from "@/lib/ai-models/pricing";
import type { AiModelPrice } from "@/lib/ai-models/types";

// D529 — the model catalog, through TanStack Query. One request per session: pickers and focus
// views select from this cache, never fetch per node (performance rule 1).
export const aiModelKeys = {
  all: ["ai-models"] as const,
  catalog: () => [...aiModelKeys.all, "catalog"] as const,
};

const CATALOG_STALE_MS = 5 * 60_000;

export function useAiCatalog() {
  return useQuery({
    queryKey: aiModelKeys.catalog(),
    queryFn: () => aiModelsService.catalog(),
    staleTime: CATALOG_STALE_MS,
  });
}

/** D534 — a model's price row valid now, selected from the session's one catalog query. `error`
 *  is a failed read with nothing cached, so a paid button can say so rather than "no price". */
export function useModelPrice(modelId: string): { price: AiModelPrice | null; loading: boolean; error: boolean } {
  const catalog = useAiCatalog();
  return {
    price: catalog.data ? currentPrice(catalog.data, modelId, new Date()) : null,
    loading: catalog.isPending,
    error: catalog.isError && !catalog.data,
  };
}
