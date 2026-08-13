"use client";

import { Clapperboard } from "lucide-react";
import type { HelpStep } from "@/lib/help/types";

// Muted autoplay video rather than a GIF — visually identical, roughly an order of
// magnitude smaller, and it degrades to a paused first frame when autoplay is blocked.
// `key` forces a remount so switching steps restarts the clip instead of resuming it.
export function HelpStepVideo({ step }: { step: HelpStep }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-border bg-muted/30 p-3">
      {step.clip ? (
        <video
          key={step.clip}
          src={step.clip}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-label={step.title}
          className="max-h-full w-full rounded-lg object-contain shadow-card"
        />
      ) : (
        // Authored but not yet recorded. A <video> with an empty src requests the page
        // itself and renders a broken frame, so the pane says plainly that there is no
        // clip — the step's title and body beside it are still the real answer.
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <Clapperboard
            className="size-5 text-muted-foreground/50"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            No clip for this step yet — the steps on the left cover it.
          </p>
        </div>
      )}
    </div>
  );
}
