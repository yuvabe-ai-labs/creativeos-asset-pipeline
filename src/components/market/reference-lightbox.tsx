"use client";

import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { embedUrlFor } from "@/lib/market/classify";
import type { MoodboardItem } from "@/lib/db/moodboards";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";

/** Plays a market reference: platform iframe for youtube/instagram/tiktok, native
 *  <video> for direct files, the shared zoom viewer for stills. Falls back to an
 *  "open source" card when playback isn't derivable (D185's degraded path). */
export function ReferenceLightbox({ item, onClose }: { item: MoodboardItem; onClose: () => void }) {
  if (item.kind === "image" || item.kind === "gif") {
    return <FullScreenImageZoom imageUrl={item.image_url} title={item.note ?? undefined} onClose={onClose} />;
  }

  const embed = embedUrlFor(item.kind, item.image_url);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        {item.kind === "video" ? (
          <video
            src={item.image_url}
            controls
            autoPlay
            playsInline
            className="max-h-[70vh] w-full rounded-lg bg-black"
          />
        ) : embed ? (
          <iframe
            src={embed}
            className={
              item.kind === "youtube"
                ? "aspect-video max-h-[70vh] w-full rounded-lg border-0 bg-black"
                : "aspect-[9/16] max-h-[70vh] w-full rounded-lg border-0 bg-black sm:mx-auto sm:w-auto"
            }
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="rounded-lg bg-background p-6 text-center">
            <p className="text-sm text-muted-foreground">No in-app preview for this reference.</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg bg-background/95 px-4 py-3 shadow-card">
          <p className="line-clamp-2 min-w-0 text-sm text-foreground">{item.note ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={item.source_url ?? item.image_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" strokeWidth={1.5} />
                  Open source
                </a>
              }
            />
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
