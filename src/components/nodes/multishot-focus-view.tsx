"use client";

import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
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
  /** This node's id — the guided "Create multishot prompt" action needs a source to wire from. */
  nodeId: string;
  order?: number;
  cuts: MultishotCut[];
  scriptTitle?: string;
  onChange: (next: MultishotCut[]) => void;
};

/**
 * The Multishot node's focus view (D230 follow-up, operator request 2026-09-03).
 *
 * A new layout, not `MultishotCutStrip` reused: the strip's flex-grow-by-seconds sizing is
 * what let a proportional bar read at a glance on a 320px card — exactly the wrong shape once
 * every row needs a full-width slider and room for multi-line text. The card stays the glance;
 * this is the workspace.
 *
 * UNIFORMITY PASS (operator request 2026-09-08). This view is assembled from the app's existing
 * parts and adds no layout ideas of its own:
 *
 *   - the sheet frame, `max-w-7xl` and the eyebrow-rail section come from `script-focus-view.tsx`
 *     and `file-focus-view.tsx`;
 *   - the cut list is the same numbered `ol` on the same 78ch measure that `script-document.tsx`
 *     uses for "Visual script" — the closest analogue in the app, an ordered set of shots;
 *   - the header's right slot is the one every prompt focus view uses: a status readout, then
 *     `GuidedNextButton variant="button"`, in one `flex shrink-0 items-center gap-2`.
 *
 * Two earlier passes were bespoke and both read as a different app: a card per cut (border and
 * shadow on every row, where the house style spends those on genuinely separate objects), then a
 * horizontal filmstrip with the sliders underneath. Both are gone. The only thing here the other
 * views do not have is the per-cut slider, which is what this node is for.
 *
 * No-Total rework (operator request 2026-09-03): there is no Total control any more — the clip's
 * length simply IS `totalOf(cuts)`, so the header just states it against Omni's ceiling. A cut's
 * slider spends headroom under that shared ceiling and NEVER moves a neighbour; when the ladder
 * is full a cut just stops growing and the line under Cuts says so.
 */
export function MultishotFocusView({
  open,
  onOpenChange,
  nodeId,
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
              {/* The header's right slot, laid out exactly as every prompt focus view lays it
                  out (prompt-focus-shell.tsx, prompt-focus-view.tsx): a status readout, then the
                  guided next step, in one `flex shrink-0 items-center gap-2`. There the readout
                  is credits used; here it is the clip's length against Omni's ceiling. Same slot,
                  same order, same spacing — so moving between nodes, the button is always in the
                  place the hand already went. */}
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">
                    <span className={outsideOmniWindow ? "text-destructive" : "text-foreground"}>
                      {total}s
                    </span>
                    <span className="text-muted-foreground"> / {OMNI_MAX_SECONDS}s max</span>
                  </p>
                  <p className="text-eyebrow mt-0.5 text-muted-foreground">{cuts.length} cuts</p>
                </div>
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
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
            <div className="grid max-w-[78ch] gap-3 text-sm">
            {atCeiling && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {OMNI_MAX_SECONDS}s maximum reached.
              </p>
            )}

            {/* Deliberately the SAME shape as the Script's "Visual script" list
                (script-document.tsx): a numbered `ol`, one plain row per shot, inside the same
                eyebrow-rail section, on the same 78ch measure.

                Two earlier attempts were bespoke and both read as a different app: a card per cut
                (border + shadow on every row, when the house style reserves those for genuinely
                separate objects), then a horizontal filmstrip. This list IS the same kind of thing
                the Script already shows — an ordered set of shots — so it looks like it. The only
                addition is the slider, which is what this node exists for. */}
            <ol className="grid gap-3">
              {cuts.map((cut, i) => (
                <li key={cut.id} className="flex items-start gap-2">
                  <span className="pt-1 tabular-nums text-muted-foreground">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <EditableField
                      value={cut.text}
                      onCommit={(text) =>
                        onChange(cuts.map((c, j) => (j === i ? { ...c, text } : c)))
                      }
                      readOnly={isReadOnly}
                      multiline
                      placeholder="Describe this cut…"
                      className="leading-relaxed"
                    />
                    <div className="mt-2 flex items-center gap-3">
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
                        className="max-w-xs"
                      />
                      <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {cut.seconds}s
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            </div>
          </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
