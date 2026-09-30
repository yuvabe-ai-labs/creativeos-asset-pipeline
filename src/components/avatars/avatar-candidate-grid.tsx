"use client";

import { useState } from "react";
import { Check, Loader2, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/kb/utils";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { groupCandidatesByBatch, type PendingCandidate } from "@/lib/avatars/generation";
import type { AvatarCandidate } from "@/lib/avatars/schema";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { AvatarGeneratingTile } from "./avatar-generating-tile";

type Props = {
  candidates: AvatarCandidate[];
  pending: PendingCandidate[];
  /** The avatar's current front image, so the picked candidate can be marked. */
  frontUrl: string | null;
  /** The generation id being set as the front, if any. */
  picking: string | null;
  /** True while the front cannot change — a sheet is generating from the current one. */
  locked: boolean;
  onPick: (candidate: AvatarCandidate) => void;
};

// Every batch generated for this avatar, newest first. Earlier attempts stay so models can be
// compared; clicking an image makes it the front, and the corner button opens it full size. A
// placeholder is the same box as the image that replaces it, so nothing moves when it arrives.
export function AvatarCandidateGrid({ candidates, pending, frontUrl, picking, locked, onPick }: Props) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const batches = groupCandidatesByBatch(candidates, pending);
  if (batches.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {batches.map((batch) => (
        <div key={batch.batchId} className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {imageGenClientModelMap[batch.modelId]?.label ?? batch.modelId}
            {batch.createdAt ? ` · ${formatDate(batch.createdAt)}` : " · generating"}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {batch.candidates.map((candidate) => {
              const isFront = candidate.url === frontUrl;
              const isPicking = picking === candidate.generationId;
              return (
                <div key={candidate.generationId} className="group/tile relative aspect-[3/4]">
                  <Button
                    variant="ghost"
                    disabled={picking !== null || locked}
                    aria-pressed={isFront}
                    aria-busy={isPicking || undefined}
                    aria-label={isFront ? "Current front image" : "Use as the front image"}
                    // Re-picking the current front is a no-op on the server too (D291 review),
                    // but skipping the call here also skips the brief "picking" spinner state.
                    onClick={() => { if (!isFront) onPick(candidate); }}
                    className={cn(
                      "size-full overflow-hidden rounded-lg border p-0",
                      isFront && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      // The one being picked stays bright while the rest dim.
                      isPicking && "disabled:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={candidate.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                    {isFront && (
                      <Badge className="absolute left-1.5 top-1.5 gap-1 bg-card">
                        <Check className="size-3 text-primary" strokeWidth={1.5} />
                        Front
                      </Badge>
                    )}
                    {isPicking && (
                      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/60 text-xs font-medium text-foreground">
                        <Loader2 className="size-5 animate-spin text-primary" strokeWidth={1.5} />
                        Setting as the front…
                      </span>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="View full size"
                    onClick={() => setZoomed(candidate.url)}
                    className={cn(
                      "absolute right-1.5 top-1.5 bg-card/90 backdrop-blur-sm",
                      // Revealed on hover or focus with a pointer; always there on touch screens.
                      "opacity-100 transition-opacity sm:opacity-0 sm:group-hover/tile:opacity-100 sm:focus-visible:opacity-100",
                    )}
                  >
                    <Maximize2 className="size-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              );
            })}
            {Array.from({ length: batch.pendingCount }, (_, i) => (
              <AvatarGeneratingTile key={`${batch.batchId}-pending-${i}`} className="aspect-[3/4]" />
            ))}
          </div>
        </div>
      ))}
      {zoomed && (
        <FullScreenImageZoom imageUrl={zoomed} title="Generated image" onClose={() => setZoomed(null)} />
      )}
    </div>
  );
}
