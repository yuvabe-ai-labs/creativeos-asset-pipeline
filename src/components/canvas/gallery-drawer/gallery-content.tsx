"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GalleryMasonry } from "./gallery-masonry";
import { GalleryList } from "./gallery-list";
import { GalleryEmptyState } from "./gallery-empty-state";
import type { GalleryImage, ViewMode } from "./types";

type Props = {
  loading: boolean;
  loadError: Error | null;
  onRetry: () => void;
  images: GalleryImage[];
  emptyMessage: string;
  viewMode: ViewMode;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
  onDragStartImage: (image: GalleryImage, e: React.DragEvent) => void;
  onSentinelInView: () => void;
  hasMore: boolean;
  loadingMore: boolean;
};

export function GalleryContent({
  loading,
  loadError,
  onRetry,
  images,
  emptyMessage,
  viewMode,
  selectedIds,
  onToggle,
  onPreview,
  onDragStartImage,
  onSentinelInView,
  hasMore,
  loadingMore,
}: Props) {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          strokeWidth={1.5}
        />
      </div>
    );
  }
  if (loadError && images.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load images.
        </p>
        <Button variant="link" size="sm" className="text-primary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (images.length === 0) {
    return <GalleryEmptyState message={emptyMessage} />;
  }

  return viewMode === "grid" ? (
    <GalleryMasonry
      images={images}
      selectedIds={selectedIds}
      onToggle={onToggle}
      onPreview={onPreview}
      onDragStartImage={onDragStartImage}
      onSentinelInView={onSentinelInView}
      hasMore={hasMore}
      loadingMore={loadingMore}
    />
  ) : (
    <GalleryList
      images={images}
      selectedIds={selectedIds}
      onToggle={onToggle}
      onPreview={onPreview}
      onDragStartImage={onDragStartImage}
      onSentinelInView={onSentinelInView}
      hasMore={hasMore}
      loadingMore={loadingMore}
    />
  );
}
