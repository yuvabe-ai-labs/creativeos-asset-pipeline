"use client";

import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { EditableField } from "./editable-field";
import {
  headroomOf,
  resizeCut,
  totalOf,
  type MultishotCut,
} from "@/lib/nodes/multishot-cuts";
import {
  MULTISHOT_MODELS,
  multishotCapabilityFor,
  checkLadder,
  describeCapability,
} from "@/lib/nodes/multishot-models";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type MultishotFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** This node's id — the guided "Create multishot prompt" action needs a source to wire from. */
  nodeId: string;
  order?: number;
  cuts: MultishotCut[];
  scriptTitle?: string;
  onChange: (next: MultishotCut[]) => void;
  /** D236 — which model this ladder is built for. Absent = the default (Gemini Omni). */
  targetModel?: string;
  onTargetModelChange: (modelId: string) => void;
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
 *   - the header's right slot is the one every prompt focus view uses: a status readout, then
 *     `GuidedNextButton variant="button"`, in one `flex shrink-0 items-center gap-2`.
 *
 * The cut strip itself is the operator's own design (sketch 2026-09-04, restored 2026-09-08):
 * cards across, each a fixed height with its text scrolling inside, and its slider directly
 * beneath. Equal heights are the point — the sliders then line up as one row across the strip,
 * which is what makes six cuts comparable at a glance.
 *
 * No-Total rework (operator request 2026-09-03): there is no Total control any more — the clip's
 * length simply IS `totalOf(cuts)`, so the header just states it against the chosen model's
 * ceiling (D236). A cut's slider spends headroom under that shared ceiling and NEVER moves a
 * neighbour; when the ladder is full a cut just stops growing and the line under Cuts says so.
 */
export function MultishotFocusView({
  open,
  onOpenChange,
  nodeId,
  order,
  cuts,
  scriptTitle,
  onChange,
  targetModel,
  onTargetModelChange,
}: MultishotFocusViewProps) {
  const editable = useCanvasEditable();
  const isReadOnly = !editable; // D33: strict read-only under the lock

  const cap = multishotCapabilityFor(targetModel);
  const total = totalOf(cuts);
  const ladder = checkLadder(cuts, cap);
  const atCeiling = headroomOf(cuts, cap) === 0;
  // Base UI resolves SelectValue's label from `items`. Without it, a bare <SelectValue /> renders
  // the raw VALUE — which is why this trigger read "gemini:gemini-omni-1.1-flash".
  const modelItems = Object.fromEntries(MULTISHOT_MODELS.map((m) => [m.id, m.label]));

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
                  guided next step, in one `flex shrink-0 items-center gap-2`. The model Select
                  leads the row because it GOVERNS the readout beside it — changing it re-derives
                  the ceiling that readout is measured against, so reading right-to-left the row
                  says "this model, this much of its budget, then what's next". */}
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  items={modelItems}
                  value={cap.id}
                  onValueChange={(v) => onTargetModelChange(String(v))}
                  disabled={isReadOnly}
                >
                  {/* Default height, matching GuidedNextButton's h-8 beside it. min-w holds the
                      slot while letting a longer model name grow instead of clipping. */}
                  <SelectTrigger className="min-w-[168px] text-sm" aria-label="Multishot model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MULTISHOT_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="items-start py-1.5">
                        <div className="flex flex-col items-start gap-0.5">
                          <span>{m.label}</span>
                          {/* Every model stays selectable. D97 — the app rejects and explains
                              rather than prevents, and checkLadder already writes that sentence. */}
                          <span className="text-xs text-muted-foreground">
                            {describeCapability(m)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">
                    <span className={ladder.ok ? "text-foreground" : "text-destructive"}>
                      {total}s
                    </span>
                    <span className="text-muted-foreground"> / {cap.maxTotalSeconds}s max</span>
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
            <div className="flex flex-col gap-4">
            {/* D237 — a ladder the current model cannot take is STATED, never clamped. Switching
                a 14s Kling ladder to Omni leaves every cut exactly where the operator put it and
                puts the problem in words here. Silent clamping is the same surprise as
                redistribution, one level up. */}
            {!ladder.ok && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {ladder.reason}
              </p>
            )}
            {ladder.ok && atCeiling && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {cap.maxTotalSeconds}s maximum reached.
              </p>
            )}

            {/* Cuts run ACROSS as a filmstrip (operator sketch, 2026-09-04). Side by side is how
                the order and the relative lengths read at a glance; stacked rows made a six-cut
                clip look like a form to fill in.

                Every card is the SAME height, whatever its text — a strip whose cards each
                stretched to their own content had the sliders landing at six different heights,
                which is the one thing the layout exists to let you compare. Longer text scrolls
                inside its card, and the scrollbar is left visible on purpose: it is the only
                signal that a card is holding more than it shows. */}
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-x-4 gap-y-5">
              {cuts.map((cut, i) => (
                <li key={cut.id} className="flex min-w-0 flex-col gap-2">
                  <div className="flex h-44 flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5 shadow-card">
                    <span className="text-eyebrow shrink-0 text-muted-foreground">
                      Shot {i + 1}
                    </span>
                    {/* min-h-0 is load-bearing: without it this flex child refuses to shrink
                        below its content and the card grows instead of scrolling. */}
                    <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
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
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    {/* Every cut's slider runs the SAME 1-cap.maxTotalSeconds scale, so a 2s cut
                        sits at the same place on every row and two cuts can be compared at a
                        glance. Deriving each max from the remaining headroom instead made an
                        untouched cut's thumb jump the moment another cut grew — its seconds were
                        unchanged, but its track had shrunk under it, which reads as the other
                        slider having moved it. A stable scale is worth more than avoiding the
                        short over-drag that resizeCut clamps. */}
                    <Slider
                      value={[cut.seconds]}
                      min={cap.minCutSeconds}
                      max={cap.maxTotalSeconds}
                      step={1}
                      disabled={isReadOnly}
                      aria-label={`Cut ${i + 1} length in seconds`}
                      onValueChange={(v) =>
                        onChange(resizeCut(cuts, i, Array.isArray(v) ? v[0] : v, cap))
                      }
                      className="w-full"
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {cut.seconds}s
                    </span>
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
