"use client";

import { FileText, Play, XCircle } from "lucide-react";

/**
 * D383 — a version's thumbnail at its real shape: 48px tall, width from the media (capped at
 * 80px). Prompt versions get a text tile. Videos show a poster frame and a small play mark.
 */
export function VersionThumb({ kind, src }: { kind: "image" | "video" | "text"; src?: string | null }) {
  if (kind === "text" || !src) {
    return (
      <span className="flex h-12 w-10 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground">
        <FileText className="size-4" strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <span className="relative block h-12 overflow-hidden rounded-sm border border-border bg-muted">
      {kind === "video" ? (
        <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="h-12 w-auto max-w-20 object-contain" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-12 w-auto max-w-20 object-contain" />
      )}
      {kind === "video" && (
        <span className="absolute bottom-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-foreground/60">
          <Play className="size-2 text-background" strokeWidth={1.5} />
        </span>
      )}
    </span>
  );
}

export function VersionFailedThumb() {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-sm border border-dashed border-destructive/50 bg-destructive/5 text-destructive">
      <XCircle className="size-4" strokeWidth={1.5} />
    </span>
  );
}
