"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { listSentence } from "@/lib/avatars/generation";
import type { PanelView } from "@/lib/scripts/visualise/state";
import { PanelFrame } from "./panel-frame";

type Props = {
  /** "S6" */
  label: string;
  /** "16.0–19.0s", the shot's place in the reel. */
  time: string;
  view: PanelView;
  aspect: string;
  credits: number | null;
  onDraw: () => void;
  onOpen: () => void;
  /** Spec 4 merge point: a comment marker on the panel. */
  marker?: ReactNode;
};

const STALE_COPY = { shot: "The shot changed", avatar: "An avatar changed" } as const;

// Spec §6.4 — one shot's panel in the Storyboard grid (the Visualise board), captioned with its
// shot and time, with Generate or Regenerate and its cost. An out-of-date panel stays visible with
// its badge and is never redrawn on its own.
export function PanelTile({ label, time, view, aspect, credits, onDraw, onOpen, marker }: Props) {
  const busy = view.status === "generating";
  const action = busy ? "Drawing…" : view.pick ? "Regenerate" : view.failure ? "Generate again" : "Generate";
  return (
    <figure className="relative m-0 flex min-w-0 flex-col gap-2">
      <PanelFrame view={view} aspect={aspect} label={label} onOpen={onOpen} />
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums">{time}</span>
      </figcaption>
      {view.status === "out_of_date" && (
        <div className="flex flex-col gap-0.5">
          <Badge variant="outline" className="self-start border-primary/30 bg-primary/5 text-primary">Out of date</Badge>
          <span className="text-xs text-muted-foreground">{view.staleBecause.map((r) => STALE_COPY[r]).join(" · ")}</span>
        </div>
      )}
      {!view.canGenerate && (
        <span className="text-xs text-muted-foreground">Waiting for {listSentence(view.waitingFor)}&apos;s avatar</span>
      )}
      {view.failure && <span className="text-xs text-destructive-text">{view.failure} Nothing was charged.</span>}
      <Button size="sm" className="w-full" variant={view.pick ? "outline" : "default"} disabled={!view.canGenerate || busy || credits === null} onClick={onDraw}>
        {action}
        <AvatarCreditCost credits={credits} />
      </Button>
      {marker}
    </figure>
  );
}
