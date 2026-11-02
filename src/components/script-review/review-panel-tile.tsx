// src/components/script-review/review-panel-tile.tsx
"use client";

import { Button } from "@/components/ui/button";
import { PanelTileCaption } from "@/components/visualise/panel-tile-caption";
import { shotAnchor } from "@/lib/scripts/anchors";
import type { Shot } from "@/lib/scripts/schema";
import { PartMarker } from "./part-marker";

/** Spec 4 §4 (review board): one shot as the client sees it — D465's storyboard tile without the
 *  pickers, Redraw or Generate: the frozen panel (a tap enlarges it), the shot written underneath,
 *  and the shot's and the panel's comments. No frame at all when the share has no panels. */
export function ReviewPanelTile({ shot, label, time, url, aspect, showFrame, onOpen }: {
  shot: Shot;
  label: string;
  time: string;
  url: string | null;
  aspect: string;
  showFrame: boolean;
  onOpen: () => void;
}) {
  const style = { aspectRatio: aspect.replace(":", " / ") };
  return (
    <figure id={shotAnchor(shot.id)} className="relative m-0 flex min-w-0 scroll-mt-6 flex-col gap-3">
      {showFrame &&
        (url ? (
          <div className="relative w-full overflow-hidden rounded-lg border border-border" style={style}>
            <Button
              variant="ghost"
              aria-label={`Open the ${label} panel`}
              onClick={onOpen}
              className="absolute inset-0 h-full w-full cursor-zoom-in rounded-none p-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-center rounded-lg border border-border bg-card text-xs text-muted-foreground" style={style}>
            No panel
          </div>
        ))}
      <PanelTileCaption label={label} beat={shot.beat} time={time} visual={shot.visual} vo={shot.vo} />
      <span className="flex items-center gap-2">
        <PartMarker part={{ kind: "shot", shotId: shot.id }} />
        {url && <PartMarker part={{ kind: "panel", shotId: shot.id }} label={`${label} panel`} />}
      </span>
    </figure>
  );
}
