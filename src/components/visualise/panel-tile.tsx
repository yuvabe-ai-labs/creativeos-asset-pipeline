"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { waitingMessage, type PanelView } from "@/lib/scripts/visualise/state";
import { PanelFrame } from "./panel-frame";

type Props = {
  /** "S6" */
  label: string;
  /** "16.0–19.0s", the shot's place in the reel. */
  time: string;
  /** The shot's visual line, shown over the frame on hover (testing). */
  description: string;
  view: PanelView;
  aspect: string;
  credits: number | null;
  onDraw: () => void;
  onOpen: () => void;
  /** Spec 4 merge point: a comment marker on the panel. */
  marker?: ReactNode;
};

const STALE_COPY = { shot: "The shot changed", avatar: "An avatar changed" } as const;

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

// Spec §6.4 — one shot's panel in the Storyboard grid (the Visualise board). Every tile has the
// same three rows whatever its state, so the grid lines up (testing): the frame, the caption, one
// button. Out of date and Failed sit on the frame as badges; why, and who an avatar is waited
// for, are tooltips. An out-of-date panel stays visible and is never redrawn on its own.
export function PanelTile({ label, time, description, view, aspect, credits, onDraw, onOpen, marker }: Props) {
  const busy = view.status === "generating";
  const action = busy ? "Drawing…" : view.pick ? "Regenerate" : view.failure ? "Generate again" : "Generate";
  const badge = view.status === "out_of_date"
    ? { text: "Out of date", hint: view.staleBecause.map((r) => STALE_COPY[r]).join(" · "), tone: "border-primary/30 bg-background text-primary" }
    : view.failure
      ? { text: "Failed", hint: `${view.failure} Nothing was charged.`, tone: "border-destructive/30 bg-background text-destructive-text" }
      : null;

  return (
    <figure className="relative m-0 flex min-w-0 flex-col gap-2">
      <div className="group relative">
        <PanelFrame view={view} aspect={aspect} label={label} onOpen={onOpen} />
        {/* The shot on hover or focus. The scrim is sized for a white sketch, the brightest case. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-foreground/90 via-foreground/70 to-transparent px-3 pb-3 pt-10 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <p className="line-clamp-5 text-xs leading-snug text-background">{description}</p>
        </div>
        {badge && (
          <Hint text={badge.hint} className="absolute left-2 top-2">
            <Badge variant="outline" className={badge.tone}>{badge.text}</Badge>
          </Hint>
        )}
      </div>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums">{time}</span>
      </figcaption>
      <Hint text={view.canGenerate ? null : waitingMessage(view.waitingFor)} className="block w-full">
        <Button size="sm" className="w-full" variant={view.pick ? "outline" : "default"} disabled={!view.canGenerate || busy || credits === null} onClick={onDraw}>
          {action}
          <AvatarCreditCost credits={credits} />
        </Button>
      </Hint>
      {marker}
    </figure>
  );
}
