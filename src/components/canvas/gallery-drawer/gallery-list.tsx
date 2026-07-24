"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [scrollRoot, setScrollRoot] = useState<Element | null>(null);
  const attachSentinelParent = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    let cur: HTMLElement | null = node.parentElement;
    while (cur) {
      const style = getComputedStyle(cur);
      if (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflow === "auto" ||
        style.overflow === "scroll"
      ) {
        setScrollRoot(cur);
        return;
      }
      cur = cur.parentElement;
    }
  }, []);

  const { ref: sentinelRef, inView } = useInView({
    rootMargin: "200px",
    threshold: 0,
    root: scrollRoot,
    triggerOnce: false,
  });

  useEffect(() => {
    if (inView && hasMore && !loadingMore) {
      onSentinelInView();
    }
  }, [inView, hasMore, loadingMore, onSentinelInView]);

  return (
    <>
      <div className="flex flex-col gap-0.5" ref={attachSentinelParent}>
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
              size="lg"
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
