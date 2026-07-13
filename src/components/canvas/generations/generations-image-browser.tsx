"use client";

import { useEffect, useState } from "react";
import { ReferenceImageGrid, type GridImage } from "../reference-image-grid";
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/canvas/${canvasId}/generations`)
      .then((r) => r.json())
      .then((res: { data: { items: CanvasGenerationItem[] } }) => {
        setImages(
          res.data.items.map((item) => ({
            id: item.id,
            imageUrl: item.imageUrl,
            filename: item.nodeName ?? "Image Gen",
            subtitle: `${item.modelUsed ?? "unknown"} · ${new Date(item.createdAt).toLocaleDateString()}`,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [open, canvasId]);

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
