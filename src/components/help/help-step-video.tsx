"use client";

import type { HelpStep } from "@/lib/help/types";

// Muted autoplay video rather than a GIF — visually identical, roughly an order of
// magnitude smaller, and it degrades to a paused first frame when autoplay is blocked.
// `key` forces a remount so switching steps restarts the clip instead of resuming it.
export function HelpStepVideo({ step }: { step: HelpStep }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-border bg-muted/30 p-3">
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
    </div>
  );
}
