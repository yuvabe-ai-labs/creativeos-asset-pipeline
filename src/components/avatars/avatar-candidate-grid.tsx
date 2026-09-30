"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/kb/utils";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { groupCandidatesByBatch, type PendingCandidate } from "@/lib/avatars/generation";
import type { AvatarCandidate } from "@/lib/avatars/schema";

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
// compared; clicking an image makes it the front. A placeholder is the same box as the image
// that replaces it, so nothing moves when a result arrives.
export function AvatarCandidateGrid({ candidates, pending, frontUrl, picking, locked, onPick }: Props) {
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
              return (
                <Button
                  key={candidate.generationId}
                  variant="ghost"
                  disabled={picking !== null || locked}
                  aria-pressed={isFront}
                  aria-label={isFront ? "Current front image" : "Use as the front image"}
                  // Re-picking the current front is a no-op on the server too (D291 review),
                  // but skipping the call here also skips the brief "picking" spinner state.
                  onClick={() => { if (!isFront) onPick(candidate); }}
                  className={cn(
                    "relative aspect-[3/4] h-auto w-full overflow-hidden rounded-lg border p-0",
                    isFront && "ring-2 ring-primary ring-offset-2 ring-offset-background",
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
                </Button>
              );
            })}
            {Array.from({ length: batch.pendingCount }, (_, i) => (
              <Skeleton key={`${batch.batchId}-pending-${i}`} className="aspect-[3/4] w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
