"use client";

import type { HelpStep } from "@/lib/help/types";

// A step: description on the left, looping clip on the right. Muted autoplay video rather
// than a GIF — visually identical, roughly an order of magnitude smaller, and it degrades
// to a paused first frame when autoplay is blocked.
export function HelpStepPage({
  step,
  index,
  total,
}: {
  step: HelpStep;
  index: number;
  total: number;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 sm:items-start">
      <div className="grid gap-3">
        <span className="text-eyebrow text-[0.65rem] text-muted-foreground">
          Step {index} of {total}
        </span>
        <h3 className="font-display text-lg font-medium">{step.title}</h3>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>
      </div>

      <video
        key={step.clip}
        src={step.clip}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="w-full rounded-xl border border-border bg-muted/40 shadow-card"
      />
    </div>
  );
}
