"use client";

import { useEffect, useState } from "react";
import { ReferenceImageGrid, type GridImage } from "../reference-image-grid";
import { useAiCatalog } from "@/hooks/queries/ai-models";
import { catalogModelLabel } from "@/lib/ai-models/model-lists";
import type { CanvasGenerationItem } from "@/app/api/canvas/[id]/generations/route";

export type GeneratedSelectedImage = {
  source: "generated";
  imageUrl: string;
  filename: string;
  generationId: string;
};

type Props = {
  canvasId: string;
  open: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string, image: GeneratedSelectedImage) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

export function GenerationsImageBrowser({
  canvasId,
  open,
  selectedIds,
  onToggle,
  searchQuery,
  onSearchChange,
}: Props) {
  const [images, setImages] = useState<GridImage[]>([]);
  const [loading, setLoading] = useState(true);
  const catalog = useAiCatalog().data;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    async function load() {
      try {
        const r = await fetch(`/api/canvas/${canvasId}/generations`, { signal: controller.signal });
        const res = (await r.json()) as { items: CanvasGenerationItem[] };
        if (controller.signal.aborted) return;
        setImages(
          res.items.map((item) => ({
            id: item.id,
            imageUrl: item.imageUrl,
            filename: item.nodeName ?? "Image Gen",
            subtitle: [catalogModelLabel(catalog, item.modelUsed), new Date(item.createdAt).toLocaleDateString()].filter(Boolean).join(" · "),
          }))
        );
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setLoading(false);
        throw err;
      }
    }

    void load();
    return () => controller.abort();
  }, [open, canvasId, catalog]);

  return (
    <ReferenceImageGrid
      images={images}
      selectedIds={selectedIds}
      onToggle={(id) => {
        const img = images.find((i) => i.id === id);
        if (!img) return;
        onToggle(id, {
          source: "generated",
          imageUrl: img.imageUrl,
          filename: img.filename,
          generationId: id,
        });
      }}
      loading={loading}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search by node name…"
      emptyMessage="No generated images yet — run an image generation node to see results here."
    />
  );
}
