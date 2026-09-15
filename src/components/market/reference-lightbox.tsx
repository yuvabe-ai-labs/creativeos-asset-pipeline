"use client";

import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { embedUrlFor, isYouTubeShort } from "@/lib/market/classify";
import type { MoodboardItem } from "@/lib/db/moodboards";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { InstagramEmbed } from "./instagram-embed";

/** Plays a market reference.
 *
 *  ARCHIVE-FIRST (D259): once the archive task has fetched the bytes, every kind plays
 *  from OUR copy — a plain <video>, or the shared zoom viewer for a still. There is
 *  deliberately NO embed fallback for an archived item: a cross-origin iframe never
 *  reports that it went blank, so "fall back when the embed fails" is not something
 *  that can actually be implemented, and pretending otherwise would mean shipping a
 *  durability story we cannot verify.
 *
 *  Before the archive lands — and permanently for `tiktok` and `link`, which are never
 *  archived — it falls back to the platform iframe, then to D185's "open source" card.
 */
export function ReferenceLightbox({ item, onClose }: { item: MoodboardItem; onClose: () => void }) {
  const archived = item.archive_status === "ready" && item.media_url ? item.media_url : null;

  // Stills go to the zoom viewer whether or not we own them; prefer our copy, which
  // for a pin is the /originals/ upgrade rather than the 736x thumbnail.
  const isStill =
    item.kind === "image" ||
    item.kind === "gif" ||
    (archived !== null && item.media_type?.startsWith("image/") === true);
  if (isStill) {
    return (
      <FullScreenImageZoom
        imageUrl={archived ?? item.image_url}
        title={item.note ?? undefined}
        onClose={onClose}
      />
    );
  }

  const embed = embedUrlFor(item.kind, item.image_url);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        {archived ? (
          <video
            src={archived}
            controls
            autoPlay
            playsInline
            className={
              // Our own file, so the aspect ratio is whatever the source was. Cap the
              // height and let the video letterbox itself rather than guessing.
              "max-h-[70vh] w-full rounded-lg bg-black"
            }
          />
        ) : item.kind === "instagram" ? (
          // Instagram only plays through its own embed.js widget — see instagram-embed.tsx.
          <InstagramEmbed url={item.source_url ?? item.image_url} />
        ) : item.kind === "video" ? (
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
              // Shorts, reels and TikToks are vertical; only standard YouTube is 16:9.
              // Framing a Short as 16:9 would letterbox it into black bars.
              item.kind === "youtube" && !isYouTubeShort(item.image_url)
                ? "aspect-video max-h-[70vh] w-full rounded-lg border-0 bg-black"
                : "aspect-[9/16] max-h-[70vh] w-full rounded-lg border-0 bg-black sm:mx-auto sm:w-auto"
            }
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="rounded-lg bg-background p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {item.archive_status === "pending" || item.archive_status === "downloading"
                ? "Saving this media — it will play here once it's stored."
                : "No in-app preview for this reference."}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg bg-background/95 px-4 py-3 shadow-card">
          <p className="line-clamp-2 min-w-0 text-sm text-foreground">{item.note ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
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
