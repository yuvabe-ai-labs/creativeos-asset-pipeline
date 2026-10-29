"use client";

import { Loader2 } from "lucide-react";
import type { MediaBox } from "@/lib/canvas/media-fit";

// YUV-423 — a card's generating state, centred on its media rather than tucked into a corner.

function GeneratingIndicator({ label }: { label: string }) {
  return (
    <span role="status" className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-card">
      <Loader2 className="size-3.5 animate-spin text-primary" strokeWidth={1.5} />
      {label}
    </span>
  );
}

/** Over the current output while a new one is made: it stays in view, veiled. Goes inside
 *  NodeMedia (its `children`), which is the positioned box. */
export function GeneratingVeil({ label = "Generating…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <GeneratingIndicator label={label} />
    </div>
  );
}

/** The first output on its way: a pulsing box in the shape it will take, the indicator centred.
 *  The pulse is its own layer so the label stays steady. */
export function GeneratingPlaceholder({ box, label = "Generating…" }: { box: MediaBox; label?: string }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-md border border-border"
      style={{ width: box.mediaWidth, height: box.mediaHeight }}
    >
      <div aria-hidden className="absolute inset-0 animate-pulse bg-primary/10" />
      <span className="relative"><GeneratingIndicator label={label} /></span>
    </div>
  );
}
