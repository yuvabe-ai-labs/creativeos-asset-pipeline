"use client";

import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaBox } from "@/lib/canvas/media-fit";

/**
 * D384 — a card's image or video, whole, in a box of exactly its shape (so `object-contain`
 * draws no bands). `edge` runs it edge to edge under the header (input tiles); otherwise it is a
 * rounded, bordered box inside the card body (output nodes). Overlays go in `children`.
 */
export function NodeMedia({
  kind,
  src,
  alt,
  box,
  onMeasured,
  edge = false,
  children,
}: {
  kind: "image" | "video";
  src: string;
  alt: string;
  box: MediaBox;
  onMeasured: (width: number, height: number) => void;
  edge?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted/40",
        edge ? "border-b border-border" : "rounded-md border border-border",
      )}
      style={{ width: box.mediaWidth, height: box.mediaHeight }}
    >
      {kind === "video" ? (
        <>
          <video
            src={`${src}#t=0.1`}
            preload="metadata"
            muted
            aria-label={alt}
            playsInline
            className="size-full object-contain"
            onLoadedMetadata={(e) => onMeasured(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          />
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/50">
            <Play className="size-3.5 text-background" strokeWidth={1.5} />
          </span>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="size-full object-contain"
          onLoad={(e) => onMeasured(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
        />
      )}
      {children}
    </div>
  );
}
