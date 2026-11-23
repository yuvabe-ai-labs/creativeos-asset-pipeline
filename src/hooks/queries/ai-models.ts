"use client";

import { useQuery } from "@tanstack/react-query";
import { aiModelsService } from "@/services/ai-models.service";
import { currentPrice } from "@/lib/ai-models/pricing";
import { imageModelsFrom, videoModelsFrom, type ImageModels, type VideoModels } from "@/lib/ai-models/model-lists";
import type { AiCatalog, AiModelPrice } from "@/lib/ai-models/types";

// D529 — the model catalog, through TanStack Query. One request per session: pickers and focus
// views select from this cache, never fetch per node (performance rule 1).
export const aiModelKeys = {
  all: ["ai-models"] as const,
  catalog: () => [...aiModelKeys.all, "catalog"] as const,
};

const CATALOG_STALE_MS = 5 * 60_000;

/** `initialData` is the catalog the server already read (the client layout's gate). */
export function useAiCatalog(initialData?: AiCatalog) {
  return useQuery({
    queryKey: aiModelKeys.catalog(),
    queryFn: () => aiModelsService.catalog(),
    staleTime: CATALOG_STALE_MS,
    initialData,
  });
}

function useCachedCatalog(): AiCatalog {
  const { data } = useAiCatalog();
  if (!data) throw new Error("useImageModels / useVideoModels need <ModelCatalogGate> above them");
  return data;
}

/** D542 — the image models, below <ModelCatalogGate>. The same object for the same catalog. */
export function useImageModels(): ImageModels {
  return imageModelsFrom(useCachedCatalog());
}

/** D542 — the video models, below <ModelCatalogGate>. */
export function useVideoModels(): VideoModels {
  return videoModelsFrom(useCachedCatalog());
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
