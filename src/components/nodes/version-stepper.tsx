// src/components/nodes/version-stepper.tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** D383 — `‹ v3 of 6 ›` beside the output heading. Views, never restores. Newest first, so the
 *  left arrow goes to a newer version. Replaces the prompt nodes' v1/v2 chips. */
export function VersionStepper({ index, total, onStep }: { index: number; total: number; onStep: (delta: 1 | -1) => void }) {
  if (total === 0 || index < 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Newer version" disabled={index === 0} onClick={() => onStep(-1)}>
        <ChevronLeft strokeWidth={1.5} />
      </Button>
      <span className="min-w-16 text-center tabular-nums">{`v${total - index} of ${total}`}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Older version" disabled={index === total - 1} onClick={() => onStep(1)}>
        <ChevronRight strokeWidth={1.5} />
      </Button>
    </div>
  );
}
