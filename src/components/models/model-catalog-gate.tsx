"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAiCatalog } from "@/hooks/queries/ai-models";
import { imageModelsFrom, videoModelsFrom } from "@/lib/ai-models/model-lists";
import type { AiCatalog } from "@/lib/ai-models/types";

// D565 — every client page renders below this, so a picker or focus view can read the model
// lists (useImageModels / useVideoModels) without a loading state of its own. With the catalog
// the server read, the children render at once and no request is made.
function usable(catalog: AiCatalog | undefined): boolean {
  if (!catalog) return false;
  const images = imageModelsFrom(catalog);
  const videos = videoModelsFrom(catalog);
  return Boolean(images.get(images.defaultId) && videos.get(videos.defaultId));
}

export function ModelCatalogGate({ initialCatalog, children }: { initialCatalog?: AiCatalog; children: ReactNode }) {
  const catalog = useAiCatalog(initialCatalog);
  if (usable(catalog.data)) return <>{children}</>;
  if (catalog.isPending || catalog.isFetching) {
    return <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">Loading…</div>;
  }
  if (catalog.data) console.error("[models] the catalog has no live image or video model");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
      <p>Could not load the models.</p>
      <Button variant="outline" size="sm" onClick={() => void catalog.refetch()}>Try again</Button>
    </div>
  );
}
