"use client";

import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { EditableField } from "./editable-field";
import {
  MIN_CUT_SECONDS,
  headroomOf,
  resizeCut,
  totalOf,
  type MultishotCut,
} from "@/lib/nodes/multishot-cuts";
import { OMNI_MAX_SECONDS, OMNI_MIN_SECONDS } from "@/lib/nodes/group-shots";

type MultishotFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: number;
  cuts: MultishotCut[];
  scriptTitle?: string;
  onChange: (next: MultishotCut[]) => void;
};

/**
 * The Multishot node's focus view (D209 follow-up, operator request 2026-09-03).
 *
 * A new layout, not `MultishotCutStrip` reused: the strip's flex-grow-by-seconds sizing is
 * what let a proportional bar read at a glance on a 320px card — exactly the wrong shape once
 * every row needs a full-width slider and room for multi-line text. This is a plain vertical
 * list instead, one roomy card per cut. The card stays the glance; this is the workspace.
 *
 * UI-consistency pass (operator request 2026-09-03): `max-w-7xl` and the eyebrow-rail section
 * layout (label in a left column, content on the right) match `script-focus-view.tsx` /
 * `script-document.tsx` and `file-focus-view.tsx`, so this view reads as the same app rather
 * than a bespoke one. No new layout ideas beyond that — see those two files for the pattern.
 *
 * No-Total rework (operator request 2026-09-03): there is no Total control any more — the clip's
 * length simply IS `totalOf(cuts)`, so the header just states it against Omni's ceiling. A cut's
 * slider spends headroom under that shared ceiling and NEVER moves a neighbour; when the ladder
 * is full a cut just stops growing and the line under Cuts says so.
 */
export function MultishotFocusView({
  open,
  onOpenChange,
  order,
  cuts,
  scriptTitle,
  onChange,
}: MultishotFocusViewProps) {
  const editable = useCanvasEditable();
  const isReadOnly = !editable; // D33: strict read-only under the lock

  const total = totalOf(cuts);
  const outsideOmniWindow = total < OMNI_MIN_SECONDS || total > OMNI_MAX_SECONDS;
  const atCeiling = headroomOf(cuts) === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="shrink-0 border-b border-border">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-auto gap-1.5 border-0 p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                  {`Multishot${order ? ` ${order}` : ""}`}
                </SheetTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {scriptTitle ? `from "${scriptTitle}" · ` : ""}full script context
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium tabular-nums">
                  <span className={outsideOmniWindow ? "text-destructive" : "text-foreground"}>
                    {total}s
                  </span>
                  <span className="text-muted-foreground"> / {OMNI_MAX_SECONDS}s max</span>
                </p>
                <p className="text-eyebrow mt-0.5 text-muted-foreground">{cuts.length} cuts</p>
              </div>
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-6">
          {/* Eyebrow-rail sections — same pattern as script-document.tsx's Section: a label in a
              sticky left column, content on the right. Adopted for consistency, not redesigned. */}
          <section className="grid gap-2.5 sm:grid-cols-[160px_1fr] sm:gap-x-10">
            <div className="self-start sm:sticky sm:top-2">
              <div className="mb-2 h-0.5 w-6 rounded-full bg-primary/70" aria-hidden />
              <span className="text-eyebrow">Cuts</span>
            </div>
            <div className="flex flex-col gap-3">
            {atCeiling && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {OMNI_MAX_SECONDS}s maximum reached.
              </p>
            )}
            {cuts.map((cut, i) => (
              <div key={cut.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <EditableField
                      value={cut.text}
                      onCommit={(text) =>
                        onChange(cuts.map((c, j) => (j === i ? { ...c, text } : c)))
                      }
                      readOnly={isReadOnly}
                      multiline
                      placeholder="Describe this cut…"
                      className="text-sm leading-relaxed"
                    />
                    <div className="mt-3 flex items-center gap-3">
                      {/* Every cut's slider runs the SAME 1-10s scale, so a 2s cut sits at the
                          same place on every row and two cuts can be compared at a glance.
                          Deriving each max from the remaining headroom instead made an untouched
                          cut's thumb jump the moment another cut grew — its seconds were
                          unchanged, but its track had shrunk under it, which reads as the other
                          slider having moved it. A stable scale is worth more than avoiding the
                          short over-drag that resizeCut clamps. */}
                      <Slider
                        value={[cut.seconds]}
                        min={MIN_CUT_SECONDS}
                        max={OMNI_MAX_SECONDS}
                        step={1}
                        disabled={isReadOnly}
                        aria-label={`Cut ${i + 1} length in seconds`}
                        onValueChange={(v) =>
                          onChange(resizeCut(cuts, i, Array.isArray(v) ? v[0] : v))
                        }
                        className="max-w-sm"
                      />
                      <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {cut.seconds}s
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
