"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { MEDIA_FADE_CLASS, useMediaReady } from "@/hooks/use-media-ready";
import { cn } from "@/lib/utils";

// YUV-422 — a panel image that fills its (relative) box. A new take is a new element (`key`), so
// the previous file never lingers while the next downloads, and it fades in over a skeleton only
// once loaded: no blank frame between "Drawing…" and the picture.
export function PanelImage({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const { ready: mediaReady, onReady: onMediaReady, measure: measureMedia } = useMediaReady(src);
  return (
    <>
      {!mediaReady && <Skeleton className="absolute inset-0 rounded-none" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        ref={measureMedia}
        src={src}
        alt={alt}
        onLoad={onMediaReady}
        // A broken file shows as itself rather than an endless skeleton.
        onError={onMediaReady}
        className={cn("absolute inset-0 size-full object-cover", MEDIA_FADE_CLASS, className, !mediaReady && "opacity-0")}
      />
    </>
  );
}
