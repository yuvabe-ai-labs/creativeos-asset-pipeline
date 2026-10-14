// src/components/scripts/script-board-frame.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The Visualise board's frame (spec 3 §4), shared with client review (spec 4 §4): the script in one
 *  pane, the Visuals pane beside it, and, when given, the Comments column at the right from `xl`.
 *  Below `lg` the panes stack, script first. */
export function ScriptBoardFrame({ script, visuals, column }: { script: ReactNode; visuals: ReactNode; column?: ReactNode }) {
  return (
    <div
      className={cn(
        "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
        column && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_20rem]",
      )}
    >
      {script}
      <section aria-label="Visuals" className="flex min-w-0 flex-col gap-6 rounded-2xl bg-muted/40 p-4">
        {visuals}
      </section>
      {column}
    </div>
  );
}
