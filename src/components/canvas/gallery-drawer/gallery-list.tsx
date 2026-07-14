"use client";

import { useInView } from "react-intersection-observer";
import { Loader2 } from "lucide-react";
import { ImageRow } from "@/components/canvas/reference-image-picker/image-row";
import type { GalleryImage } from "./types";

type Props = {
  images: GalleryImage[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
  onDragStartImage: (image: GalleryImage, e: React.DragEvent) => void;
  onSentinelInView: () => void;
  hasMore: boolean;
  loadingMore: boolean;
};

export function GalleryList({
  images,
  selectedIds,
  onToggle,
  onPreview,
  onDragStartImage,
  onSentinelInView,
  hasMore,
  loadingMore,
}: Props) {
  const { ref: sentinelRef, inView } = useInView({
    rootMargin: "200px",
    triggerOnce: false,
  });

  if (inView && hasMore && !loadingMore) {
    onSentinelInView();
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {images.map((image) => (
          <div
            key={image.id}
            draggable
            onDragStart={(e) => onDragStartImage(image, e)}
          >
            <ImageRow
              image={image}
              selected={selectedIds.has(image.id)}
              onToggle={() => onToggle(image.id)}
              onPreview={() => onPreview(image.id)}
            />
          </div>
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-3">
          {loadingMore && (
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              strokeWidth={1.5}
            />
          )}
        </div>
      )}
    </>
  );
}
