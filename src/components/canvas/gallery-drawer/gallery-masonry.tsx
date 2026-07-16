"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { MasonryPhotoAlbum } from "react-photo-album";
import "react-photo-album/masonry.css";
import { useInView } from "react-intersection-observer";
import { Loader2 } from "lucide-react";
import { useImageDimensions } from "@/hooks/use-image-dimensions";
import { ImageTile } from "@/components/canvas/reference-image-picker/image-tile";
import type { GalleryImage } from "./types";

type AlbumPhoto = {
  key: string;
  src: string;
  width: number;
  height: number;
  gridImage: GalleryImage;
};

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

export function GalleryMasonry({
  images,
  selectedIds,
  onToggle,
  onPreview,
  onDragStartImage,
  onSentinelInView,
  hasMore,
  loadingMore,
}: Props) {
  const urls = useMemo(() => images.map((img) => img.imageUrl), [images]);
  const dimensions = useImageDimensions(urls);

  const photos: AlbumPhoto[] = useMemo(
    () =>
      images.map((img) => {
        const dim = dimensions.get(img.imageUrl) ?? { width: 400, height: 400 };
        return {
          key: img.id,
          src: img.imageUrl,
          width: dim.width,
          height: dim.height,
          gridImage: img,
        };
      }),
    [images, dimensions],
  );

  // The sentinel lives inside the drawer's scrollable div (overflow-y-auto).
  // We resolve that ancestor at mount and pass it as the IntersectionObserver
  // root so the trigger fires as content scrolls past the container edge —
  // not the browser viewport, which would never intersect.
  const [scrollRoot, setScrollRoot] = useState<Element | null>(null);
  const attachSentinelParent = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    // Walk up until we find an element with a scroll overflow style.
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

  // Firing setState during render violates React rules. Trigger in an effect
  // when inView flips to true and we're not already loading.
  useEffect(() => {
    if (inView && hasMore && !loadingMore) {
      onSentinelInView();
    }
  }, [inView, hasMore, loadingMore, onSentinelInView]);

  return (
    <div ref={attachSentinelParent}>
      <MasonryPhotoAlbum
        photos={photos}
        columns={(width) => (width < 480 ? 4 : width < 720 ? 5 : 6)}
        spacing={4}
        render={{
          photo: ({ onClick }, { photo, width, height }) => {
            const p = photo as AlbumPhoto;
            return (
              <div
                draggable
                onDragStart={(e) => onDragStartImage(p.gridImage, e)}
                style={{ width, height }}
              >
                <ImageTile
                  image={p.gridImage}
                  selected={selectedIds.has(p.gridImage.id)}
                  width={width}
                  height={height}
                  onClick={(e) => onClick?.(e as React.MouseEvent)}
                  onPreview={() => onPreview(p.gridImage.id)}
                />
              </div>
            );
          },
        }}
        onClick={({ photo }) => onToggle((photo as AlbumPhoto).gridImage.id)}
      />
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
    </div>
  );
}
