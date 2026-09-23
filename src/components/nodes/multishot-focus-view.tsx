"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { EditableField } from "./editable-field";
import { VoLinesEditor } from "./vo-lines-editor";
import {
  canAddCut,
  insertCut,
  removeCut,
  resizeCut,
  totalOf,
  type MultishotCut,
} from "@/lib/nodes/multishot-cuts";
import {
  commitDraft,
  draftIsDirty,
  type MultishotDraft,
} from "@/lib/nodes/multishot-draft";
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
  /** The SAVED ladder. Edits are buffered locally and reach the node only through `onCommit`. */
  cuts: MultishotCut[];
  scriptTitle?: string;
  /** D236 — which model this ladder is built for. Absent = the default (Gemini Omni). */
  targetModel?: string;
  /** D280 — one patch, applied by a single updateNodeData call on Save. */
  onCommit: (patch: ReturnType<typeof commitDraft>) => void;
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
  targetModel,
  onCommit,
}: MultishotFocusViewProps) {
  const editable = useCanvasEditable();
  const isReadOnly = !editable; // D33: strict read-only under the lock

  const saved: MultishotDraft = useMemo(
    () => ({ cuts, ...(targetModel !== undefined ? { targetModel } : {}) }),
    [cuts, targetModel],
  );
  const [draft, setDraft] = useState<MultishotDraft>(saved);

  // Reseed when the sheet opens or the saved ladder changes underneath. Adjusting state during
  // render is React's documented alternative to a reset effect, and is the same thing
  // script-focus-view.tsx does against its own `seed` sentinel.
  const [seed, setSeed] = useState({ open, saved });
  if (seed.open !== open || seed.saved !== saved) {
    setSeed({ open, saved });
    setDraft(saved);
  }

  // Same shape script-focus-view.tsx uses, `actionLabel` included — one dialog, several callers.
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const dirty = draftIsDirty(saved, draft);

  // Everything below reads the DRAFT, so the ladder on screen, the ceiling it is measured
  // against and the violation sentence all describe the same state the operator is looking at.
  const cap = multishotCapabilityFor(draft.targetModel);
  const total = totalOf(draft.cuts);
  const ladder = checkLadder(draft.cuts, cap);
  const addable = canAddCut(draft.cuts, cap);
  // Base UI resolves SelectValue's label from `items`. Without it, a bare <SelectValue /> renders
  // the raw VALUE — which is why this trigger read "gemini:gemini-omni-1.1-flash".
  const modelItems = Object.fromEntries(MULTISHOT_MODELS.map((m) => [m.id, m.label]));

  const setCuts = (next: MultishotCut[]) => setDraft((d) => ({ ...d, cuts: next }));

  function handleSave() {
    onCommit(commitDraft(draft));
  }

  function requestClose() {
    if (dirty) {
      setConfirm({
        title: "Discard unsaved changes?",
        description: "You have shot edits that haven't been saved. Closing now will discard them.",
        actionLabel: "Discard",
        onConfirm: () => onOpenChange(false),
      });
      return;
    }
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
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
              onClick={requestClose}
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
                  onValueChange={(v) => setDraft((d) => ({ ...d, targetModel: String(v) }))}
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
                  <p className="text-eyebrow mt-0.5 text-muted-foreground">
                    {draft.cuts.length} cuts
                  </p>
                </div>
                {dirty && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    Unsaved changes
                  </span>
                )}
                {!isReadOnly && (
                  <>
                    <Button variant="ghost" onClick={() => setDraft(saved)} disabled={!dirty}>
                      Cancel
                    </Button>
                    {/* D280 — Save is a synchronous updateNodeData, not a version write: this
                        node has no node_versions row. So no async, no error path, and no
                        "Saved" toast — the durable write is autosave's and has not happened
                        yet. The pill clearing is the truthful feedback. */}
                    <Button
                      variant={dirty ? "default" : "outline"}
                      onClick={handleSave}
                      disabled={!dirty}
                    >
                      Save
                    </Button>
                  </>
                )}
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                  onBeforeNavigate={
                    dirty
                      ? () =>
                          setConfirm({
                            title: "Discard unsaved shot edits?",
                            description:
                              "The Multishot Prompt will be written against the shots as they were last saved.",
                            actionLabel: "Continue",
                            // Discarding here means closing the sheet on the saved ladder; the
                            // operator then takes the guided step again from the card.
                            onConfirm: () => onOpenChange(false),
                          })
                      : undefined
                  }
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
            {ladder.ok && !addable.ok && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.5} />
                {addable.reason}
              </p>
            )}

            {/* Cuts run ACROSS as a filmstrip (operator sketch, 2026-09-04). Side by side is how
                the order and the relative lengths read at a glance; stacked rows made a six-cut
                clip look like a form to fill in.

                Every card in a row is the SAME height, whatever its text — a strip whose cards
                each sized to their own content had the sliders landing at six different heights,
                which is the one thing the layout exists to let you compare. That equality comes
                from the grid row stretching them, NOT from a fixed height: a fixed one turned a
                second spoken line into two duelling scrollbars and a clipped sentence. Only a very
                long description scrolls, and its scrollbar is left visible on purpose — it is the
                only signal that a card is holding more than it shows. */}
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(272px,1fr))] gap-x-4 gap-y-5">
              {draft.cuts.map((cut, i) => (
                <li key={cut.id} className="group/shot flex min-w-0 flex-col gap-2">
                  {/* No fixed height. The grid row already stretches every card to the tallest in
                      its row, so the sliders line up without one — and a fixed height is what
                      broke the moment a shot got a second spoken line: the description and the
                      lane fought over 224px, each grew a scrollbar, the prose clipped mid-sentence
                      and the Add-line chip was pushed out of the card. The card grows with its
                      content; only a very long description scrolls, and it does so within a bound
                      that keeps a row from running away. */}
                  <div className="flex min-h-[9rem] flex-1 flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5 shadow-card">
                    {/* The controls share the Shot N row and appear on hover — the VoLinesEditor
                        idiom, for the same reason: a six-shot strip should read as six shots,
                        not as twelve buttons. */}
                    <div className="flex shrink-0 items-center justify-between gap-1">
                      <span className="text-eyebrow text-muted-foreground">Shot {i + 1}</span>
                      {!isReadOnly && (
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/shot:opacity-100">
                          <Button
                            variant="ghost"
                            aria-label={`Insert a shot after shot ${i + 1}`}
                            disabled={!addable.ok}
                            onClick={() => setCuts(insertCut(draft.cuts, i + 1, cap))}
                            className="nodrag h-auto rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                          >
                            <Plus className="size-3" strokeWidth={1.5} />
                          </Button>
                          {/* A single-shot ladder shows no X: removeCut refuses the last cut,
                              and a control that does nothing is worse than no control. */}
                          {draft.cuts.length > 1 && (
                            <Button
                              variant="ghost"
                              aria-label={`Remove shot ${i + 1}`}
                              onClick={() => setCuts(removeCut(draft.cuts, i))}
                              className="nodrag h-auto rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
                            >
                              <X className="size-3" strokeWidth={1.5} />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    {/* min-h-0 is load-bearing: without it this flex child refuses to shrink
                        below its content and the card grows instead of scrolling. max-h bounds a
                        long description so one wordy shot cannot stretch every card in its row. */}
                    <div className="min-h-0 max-h-44 flex-1 overflow-y-auto pr-0.5">
                      <EditableField
                        value={cut.text}
                        onCommit={(text) =>
                          setCuts(draft.cuts.map((c, j) => (j === i ? { ...c, text } : c)))
                        }
                        readOnly={isReadOnly}
                        multiline
                        placeholder="Describe this cut…"
                        className="text-sm leading-relaxed"
                        // Edits IN PLACE: same padding as the display state, no border or ring, a
                        // faint tint to say "editing", and content-sized so this card's own
                        // scroller stays the only scrollbar. The primitive's boxed field put a
                        // second scrollbar and a shifted text column inside an already-scrolling
                        // card.
                        editClassName="min-h-0 resize-none rounded-md border-0 bg-primary/5 px-1.5 py-1 shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm"
                      />
                    </div>

                    {/* The spoken line gets its OWN lane, below the description's scroller rather
                        than inside it (operator, 2026-09-23: "vo is hidden under scroll"). What a
                        shot SAYS is not a footnote to what it shows — it is the other half of the
                        shot, and it was reachable only by scrolling a 176px box that gave no sign
                        there was anything below the prose.

                        The lane is `shrink-0` and never scrolls: it grows with its lines and the
                        card grows with it. A silent shot still shows the Add-line chip, so the
                        lane never collapses into an invisible strip. */}
                    {/* Under the read-only lock a silent shot has nothing to put in the lane, and
                        a heading over an empty space reads as a loading state. */}
                    {(!isReadOnly || (cut.voiceover?.length ?? 0) > 0) && (
                      <div className="mt-1 flex min-h-0 shrink-0 flex-col border-t border-border/70 pt-2">
                        {/* The label sits OUTSIDE the scroller. Inside it, the first shot with two
                            lines scrolled its own heading out of view, so one card said
                            "Voiceover" and its neighbour said nothing. */}
                        <span className="text-eyebrow shrink-0 text-muted-foreground">
                          Voiceover
                        </span>
                        {/* No scroller of its own: every line has to stay reachable, and the
                            Add-line chip below them is the one control that must never be the
                            thing that gets clipped. The lane grows; the row grows with it. */}
                        <div className="mt-1">
                          <VoLinesEditor
                            lines={cut.voiceover}
                            readOnly={isReadOnly}
                            onChange={(next) =>
                              setCuts(
                                draft.cuts.map((c, j) =>
                                  j === i ? { ...c, voiceover: next } : c,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    )}
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
                        setCuts(resizeCut(draft.cuts, i, Array.isArray(v) ? v[0] : v, cap))
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

            {!isReadOnly && (
              <Button
                variant="ghost"
                onClick={() => setCuts(insertCut(draft.cuts, draft.cuts.length, cap))}
                disabled={!addable.ok}
                className="nodrag h-auto w-fit rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
              >
                <Plus className="size-4" strokeWidth={1.5} /> Add shot
              </Button>
            )}
            </div>
          </section>
          </div>
        </div>
      </SheetContent>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              {confirm?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
