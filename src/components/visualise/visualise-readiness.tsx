"use client";

import type { ReactNode } from "react";
import type { ScriptStage } from "@/lib/scripts/constants";
import type { GenerateAllPlan, Readiness } from "@/lib/scripts/visualise/state";
import { GenerateAllDialog } from "./generate-all-dialog";
import { ReopenDialog } from "./reopen-dialog";

type Props = {
  stage: ScriptStage;
  readiness: Readiness;
  plan: GenerateAllPlan;
  kitsFound: boolean;
  drawingAll: boolean;
  reopening: boolean;
  onGenerateAll: () => void;
  onReopen: () => void;
  /** Spec 4's review actions (merge point MP4), before Visualise's own. */
  extra?: ReactNode;
};

// Spec §4, §7 — the readiness line at the top: the two counts spec 4 reads, Generate all, and
// Reopen (only from Visualise).
export function VisualiseReadiness({ stage, readiness: r, plan, kitsFound, drawingAll, reopening, onGenerateAll, onReopen, extra }: Props) {
  return (
    <section aria-label="Visualise" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-card">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-eyebrow">Visualise</span>
        <span className="text-sm tabular-nums">
          {r.castReady} of {r.castTotal} cast with an avatar · {r.panelsCurrent} of {r.shotsTotal} shots with a current panel
        </span>
        {!kitsFound && (
          <span className="text-xs text-muted-foreground">
            No regional kits found in the brand KB, so panels are drawn without one.
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {extra}
        {stage === "visualise" && <ReopenDialog busy={reopening} onConfirm={onReopen} />}
        <GenerateAllDialog plan={plan} busy={drawingAll} onConfirm={onGenerateAll} />
      </div>
    </section>
  );
}
