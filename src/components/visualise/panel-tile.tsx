"use client";

import type { ReactNode } from "react";
import { History, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { ScriptShotAssets } from "@/components/scripts/script-shot-assets";
import { RedrawPopover } from "@/components/shared/redraw-popover";
import { shotAnchor } from "@/lib/scripts/anchors";
import type { ScriptDoc, Shot } from "@/lib/scripts/schema";
import { PANEL_REDRAW_SUGGESTIONS } from "@/lib/scripts/visualise/constants";
import type { DrawBody } from "@/lib/scripts/visualise/schema";
import { waitingMessage, type PanelView } from "@/lib/scripts/visualise/state";
import { PanelFrame } from "./panel-frame";
import { PanelTileCaption } from "./panel-tile-caption";
import { cn } from "@/lib/utils";

type Props = {
  shot: Shot;
  /** The script's products and locations, for the shot's pickers (D446). */
  doc: Pick<ScriptDoc, "products" | "locations">;
  /** "S6" */
  label: string;
  /** "16.0–19.0s", the shot's place in the reel. */
  time: string;
  view: PanelView;
  aspect: string;
  credits: number | null;
  onDraw: () => void;
  /** D449 — Redraw on a panel that has a take: change it by a note, or draw anew. */
  onRedraw: (body: DrawBody) => void;
  /** D465 — the panel view (versions, the prompt, the whole shot), from the frame's Versions. */
  onVersions: () => void;
  /** Spec 4 merge point: the tile's one comment marker, for the shot and its panel (D465). */
  shotMarker?: ReactNode;
};

const STALE_COPY = { shot: "The shot changed", avatar: "An avatar changed" } as const;

// On the frame, shown on hover or keyboard focus; always shown where there is no hover (touch).
// The wrapper carries the visibility, so a disabled pill's own opacity never keeps it on screen.
const REDRAW_ON_FRAME =
  "absolute right-2 top-2 z-10 opacity-100 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 has-[[data-popup-open]]:opacity-100";
const REDRAW_PILL = "h-7 rounded-full bg-background/95 shadow-card";

/** A hint on hover. A disabled button gets no pointer events, so the trigger is a span around it. */
function Hint({ text, children, className }: { text: string | null; children: ReactNode; className?: string }) {
  if (!text) return <>{children}</>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className={className} />}>{children}</TooltipTrigger>
        <TooltipContent side="top">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// D465 — one shot on the storyboard sheet: the frame, then its shot written underneath as on a
// classic storyboard, then the shot's product and location. Redraw sits on a drawn frame; only a
// shot with no panel yet has a button below. Out of date and Failed sit on the frame as badges.
export function PanelTile({ shot, doc, label, time, view, aspect, credits, onDraw, onRedraw, onVersions, shotMarker }: Props) {
  const busy = view.status === "generating";
  const badge = view.status === "out_of_date"
    ? { text: "Out of date", hint: view.staleBecause.map((r) => STALE_COPY[r]).join(" · "), tone: "border-primary/30 bg-background text-primary" }
    : view.failure
      ? { text: "Failed", hint: `${view.failure} Nothing was charged.`, tone: "border-destructive/30 bg-background text-destructive-text" }
      : null;

  return (
    <figure id={shotAnchor(shot.id)} className="relative m-0 flex min-w-0 scroll-mt-6 flex-col gap-3">
      <div className="group relative">
        <PanelFrame view={view} aspect={aspect} label={label} description={shot.visual} />
        {badge && (
          <Hint text={badge.hint} className="absolute left-2 top-2">
            <Badge variant="outline" className={badge.tone}>{badge.text}</Badge>
          </Hint>
        )}
        {view.pick && !busy && (
          <span className={cn(REDRAW_ON_FRAME, "flex gap-1.5")}>
            <Button variant="outline" size="sm" className={REDRAW_PILL} onClick={onVersions}>
              <History className="size-3.5" strokeWidth={1.5} />
              Versions
            </Button>
            {/* Why it can't redraw yet (an avatar it waits for), as the Generate button says. */}
            <Hint text={view.canGenerate ? null : waitingMessage(view.waitingFor)}>
              <RedrawPopover
                suggestions={PANEL_REDRAW_SUGGESTIONS}
                credits={credits}
                canChange={Boolean(view.pick.url)}
                disabled={!view.canGenerate || credits === null}
                className={REDRAW_PILL}
                trigger={<><RefreshCw className="size-3.5" strokeWidth={1.5} />Redraw</>}
                onChange={(note) => onRedraw({ kind: "change", note })}
                onFresh={(note) => onRedraw({ kind: "fresh", note })}
              />
            </Hint>
          </span>
        )}
      </div>
      <PanelTileCaption shotId={shot.id} label={label} beat={shot.beat} time={time} visual={shot.visual} vo={shot.vo} />
      <ScriptShotAssets shot={shot} doc={doc} />
      {!view.pick && (
        <Hint text={view.canGenerate ? null : waitingMessage(view.waitingFor)} className="block w-full">
          <Button size="sm" className="w-full" disabled={!view.canGenerate || busy || credits === null} onClick={onDraw}>
            {busy ? "Drawing…" : view.failure ? "Generate again" : "Generate"}
            <AvatarCreditCost credits={credits} />
          </Button>
        </Hint>
      )}
      {shotMarker}
    </figure>
  );
}
