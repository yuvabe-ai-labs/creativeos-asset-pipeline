// src/components/script-review/review-panel-tile.tsx
"use client";

import { Button } from "@/components/ui/button";
import { PanelHoverLine } from "@/components/visualise/panel-hover-line";
import { PartMarker } from "./part-marker";

/** Spec 4 §4 (review board): one shot's panel as the client sees it — spec 3's tile without the
 *  Generate button or status badges; the shot's line on hover; a tap enlarges it. */
export function ReviewPanelTile({ shotId, label, time, description, url, aspect, onOpen }: {
  shotId: string;
  label: string;
  time: string;
  description: string;
  url: string | null;
  aspect: string;
  onOpen: () => void;
}) {
  const style = { aspectRatio: aspect.replace(":", " / ") };
  return (
    <figure className="relative m-0 flex min-w-0 flex-col gap-2">
      <div className="group relative">
        {url ? (
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
        )}
        {url && <PanelHoverLine text={description} />}
      </div>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums">{time}</span>
      </figcaption>
      {url && <PartMarker part={{ kind: "panel", shotId }} label={`${label} panel`} className="self-start" />}
    </figure>
  );
}
