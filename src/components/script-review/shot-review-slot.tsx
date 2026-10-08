// src/components/script-review/shot-review-slot.tsx
"use client";

import type { Shot } from "@/lib/scripts/schema";
import type { PanelSnapshot } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { PartComments } from "./part-comments";

/** What review puts in a shot's row: its frozen panel (client, on a full share) with the panel's
 *  comments, and the shot's own comments. On a phone the panel stacks above them (spec 4 §4). */
export function ShotReviewSlot({ shot, panel }: { shot: Shot; panel?: PanelSnapshot }) {
  const { mode } = useReviewSurface();
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start">
      {panel ? (
        <figure className="flex w-full max-w-48 flex-col gap-2 md:w-40 md:shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={panel.url} alt="Storyboard panel" className="aspect-[9/16] w-full rounded-lg border border-border bg-muted object-cover" />
          <PartComments part={{ kind: "panel", shotId: shot.id }} label="Panel" />
        </figure>
      ) : mode === "team" ? (
        // MERGE POINT (MP4, spec 3): the team's panel is spec 3's; until then panel threads sit here.
        <PartComments part={{ kind: "panel", shotId: shot.id }} label="Panel" />
      ) : null}
      <div className="min-w-0 flex-1">
        <PartComments part={{ kind: "shot", shotId: shot.id }} />
      </div>
    </div>
  );
}
