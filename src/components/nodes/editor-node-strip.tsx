"use client";

import { cn } from "@/lib/utils";
import type { EditSummary } from "@/lib/editor/summary";

/** The card's timeline preview (mockup): a block per piece, a dubbed piece underlined in the brand
 *  colour, and a thin row of the captions under it. */
export function EditorNodeStrip({ summary }: { summary: EditSummary }) {
  if (summary.strip.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" aria-label="Timeline preview">
      <div className="flex h-[26px] gap-[3px]">
        {summary.strip.map((piece, i) => (
          <div
            key={piece.id}
            className={cn("rounded-[5px]", i % 2 === 0 ? "bg-muted" : "bg-accent", piece.dubbed && "shadow-[inset_0_-3px_0_var(--primary)]")}
            style={{ flexGrow: piece.fraction, flexBasis: 0, minWidth: 2 }}
          />
        ))}
      </div>
      <div className="relative h-2">
        {summary.captionStrip.map((c) => (
          <div
            key={c.id}
            className="absolute inset-y-0 rounded-[3px] bg-border"
            style={{ left: `${c.start * 100}%`, width: `${Math.max(c.width * 100, 1)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
