"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { formatDate } from "@/lib/kb/utils";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { groupCandidatesByBatch, type PendingCandidate } from "@/lib/avatars/generation";
import type { AvatarCandidate } from "@/lib/avatars/schema";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { AvatarCandidateTile } from "./avatar-candidate-tile";
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
  /** How many images the next Generate makes — the empty slots shown before the first one. */
  emptyCount: number;
  onPick: (candidate: AvatarCandidate) => void;
};

// The Look step's results column. Before anything is generated it shows the slots the next
// Generate will fill, so it is clear where the images will land. After, every batch for this
// avatar, newest first — earlier attempts stay so models can be compared. A placeholder is the
// same box as the image that replaces it, so nothing moves when it arrives.
export function AvatarCandidateGrid({ candidates, pending, frontUrl, picking, locked, emptyCount, onPick }: Props) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const batches = groupCandidatesByBatch(candidates, pending);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-eyebrow text-muted-foreground">Generated images</span>
        {batches.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {frontUrl ? "Tick another to change the front" : "Tick one to use as the front"}
          </span>
        )}
      </div>

      {batches.length === 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: emptyCount }, (_, i) => (
            <div
              key={i}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 text-center text-xs text-muted-foreground"
            >
              <ImageIcon className="size-5" strokeWidth={1.5} />
              {i === 0 && "Your images appear here"}
            </div>
          ))}
        </div>
      ) : (
        batches.map((batch) => (
          <div key={batch.batchId} className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {imageGenClientModelMap[batch.modelId]?.label ?? batch.modelId}
              {batch.createdAt ? ` · ${formatDate(batch.createdAt)}` : " · generating"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {batch.candidates.map((candidate) => (
                <AvatarCandidateTile
                  key={candidate.generationId}
                  candidate={candidate}
                  isFront={candidate.url === frontUrl}
                  isPicking={picking === candidate.generationId}
                  disabled={picking !== null || locked}
                  onPick={() => onPick(candidate)}
                  onZoom={() => setZoomed(candidate.url)}
                />
              ))}
              {Array.from({ length: batch.pendingCount }, (_, i) => (
                <AvatarGeneratingTile key={`${batch.batchId}-pending-${i}`} className="aspect-[3/4]" />
              ))}
            </div>
          </div>
        ))
      )}

      {zoomed && (
        <FullScreenImageZoom imageUrl={zoomed} title="Generated image" onClose={() => setZoomed(null)} />
      )}
    </div>
  );
}
