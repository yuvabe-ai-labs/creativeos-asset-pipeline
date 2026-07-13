"use client";

import { useMemo, useState } from "react";
import { SearchBar } from "./reference-image-picker/search-bar";
import { ViewModeToggle } from "./reference-image-picker/view-mode-toggle";
import { ImageMasonryView } from "./reference-image-picker/image-masonry-view";
import { ImageListView } from "./reference-image-picker/image-list-view";
import { CenteredLoader } from "./reference-image-picker/centered-loader";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import type { GridImage, ViewMode } from "./reference-image-picker/types";

export type { GridImage } from "./reference-image-picker/types";

type Props = {
  images: GridImage[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  emptyMessage: string;
};

export function ReferenceImageGrid({
  images,
  selectedIds,
  onToggle,
  loading,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search…",
  emptyMessage,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      images.filter((img) =>
        img.filename.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [images, searchQuery],
  );

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex-1">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
          />
        </div>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <CenteredLoader />
        ) : filtered.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : viewMode === "grid" ? (
          <ImageMasonryView
            images={filtered}
            selectedIds={selectedIds}
            onToggle={onToggle}
            onPreview={setPreviewId}
          />
        ) : (
          <ImageListView
            images={filtered}
            selectedIds={selectedIds}
            onToggle={onToggle}
            onPreview={setPreviewId}
          />
        )}
      </div>

      {previewId &&
        (() => {
          const img = images.find((i) => i.id === previewId);
          if (!img) return null;
          return (
            <FullScreenImageZoom
              imageUrl={img.previewUrl ?? img.imageUrl}
              title={img.filename}
              onClose={() => setPreviewId(null)}
            />
          );
        })()}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
