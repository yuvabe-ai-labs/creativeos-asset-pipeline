// The Multishot node's cut list (D209). One shared ceiling, no separate "total" to reconcile
// (operator request 2026-09-03).
//
// The model, in one line: **the ladder may run up to OMNI_MAX_SECONDS, and each cut grows into
// whatever is unspent.** There is no Total control — the clip's length simply IS the sum of its
// cuts, so there are never two numbers to keep in agreement.
//
// What this module guarantees:
//   - every cut's `seconds >= MIN_CUT_SECONDS`
//   - `totalOf(cuts) <= OMNI_MAX_SECONDS` after any mutation
//   - **resizing a cut NEVER changes another cut**
//
// That last one is the operator's explicit requirement, and it is why there is no
// redistribution: a slider that silently moves a different slider is a surprise, and a surprise
// in a control that decides what gets billed is worse than a limit you can see. When the ladder
// is full, a cut simply stops growing and the view says to shorten another one — the limit is
// stated rather than worked around.
//
// Because the request's duration is derived from `totalOf(cuts)`, the ladder and the duration are
// equal by construction at every moment — which is what keeps a longer-than-duration ladder from
// coming back truncated at full price. No generation-time balance check is needed.
//
// History, so nobody reintroduces a solved argument: this replaced a fixed-budget model where
// cuts traded seconds pairwise, and then a two-number model with an explicit Total plus a
// remainder and a "Fit to total" action. Both were rejected for the same reason — they made one
// control's movement depend on another's.
import type { ReelShot } from "./reel-script";
import { shotSeconds, OMNI_MIN_SECONDS, OMNI_MAX_SECONDS } from "./group-shots";

export type MultishotCut = {
  /**
   * Stable across edit, add, delete and reorder. The Multishot Prompt node keys its per-cut
   * instruction on this, and the returned plan joins back on it. NEVER an index — reordering
   * or deleting a cut would silently repoint every instruction written for its neighbours.
   */
  id: string;
  text: string;
  seconds: number;
};

/** No cut is ever shorter than this. A drag that would go below it stops instead. */
export const MIN_CUT_SECONDS = 1;

export function newCut(text: string, seconds: number): MultishotCut {
  return { id: crypto.randomUUID(), text, seconds };
}

export function cutsFromShots(shots: ReelShot[]): MultishotCut[] {
  // This is the one entry point that constructs cuts from external data. Every mutation
  // downstream assumes cuts already satisfy the invariant (integer, >= MIN_CUT_SECONDS),
  // so we establish it here rather than leaving it for a validator to catch downstream.
  return shots.map((s) =>
    newCut(s.description ?? "", Math.max(MIN_CUT_SECONDS, Math.round(shotSeconds(s))))
  );
}

export function shotsFromCuts(cuts: MultishotCut[]): ReelShot[] {
  return cuts.map((c) => ({ description: c.text, duration_seconds: c.seconds }));
}

/** The ladder's length — the sum of its cuts, and the duration the video request is derived from. */
export function totalOf(cuts: MultishotCut[]): number {
  return cuts.reduce((sum, c) => sum + c.seconds, 0);
}

/** Clamps a seconds value into Omni's window. Used when seeding a node's stored total. */
export function clampTotal(seconds: number): number {
  return Math.min(OMNI_MAX_SECONDS, Math.max(OMNI_MIN_SECONDS, Math.round(seconds)));
}

/** How many seconds are still unspent under the ceiling. Zero once the ladder is full. */
export function headroomOf(cuts: MultishotCut[]): number {
  return Math.max(0, OMNI_MAX_SECONDS - totalOf(cuts));
}

/**
 * The largest `seconds` a call to `resizeCut(cuts, index, …)` can actually produce: this cut's
 * own length plus whatever is unspent under OMNI_MAX_SECONDS.
 *
 * The ceiling is shared across the whole ladder rather than owned per cut, so a cut can grow only
 * as far as the free seconds allow. When the ladder is already full this returns the cut's current
 * length — the slider simply stops, and the view tells the operator to shorten another cut.
 *
 * The Slider takes its `max` from here, so the thumb can never be dragged past what `resizeCut`
 * would clamp to — no dead track that springs back.
 */
export function maxSecondsFor(cuts: MultishotCut[], index: number): number {
  if (index < 0 || index >= cuts.length) return 0;
  return Math.max(MIN_CUT_SECONDS, cuts[index].seconds + headroomOf(cuts));
}

/**
 * Set one cut's length.
 *
 * NO NEIGHBOUR EVER CHANGES. Growing a cut spends free seconds under the ceiling; it never takes
 * them from another cut. That was the operator's explicit objection to the earlier
 * budget-redistribution model — a slider that silently moves another slider is a surprise, and a
 * surprise in a control that decides what gets billed is worse than a limit you can see.
 *
 * Clamped to [MIN_CUT_SECONDS, maxSecondsFor(cuts, index)].
 */
export function resizeCut(cuts: MultishotCut[], index: number, seconds: number): MultishotCut[] {
  if (index < 0 || index >= cuts.length) return cuts;

  const next = Math.max(
    MIN_CUT_SECONDS,
    Math.min(Math.round(seconds), maxSecondsFor(cuts, index)),
  );
  if (next === cuts[index].seconds) return cuts;

  return cuts.map((c, i) => (i === index ? { ...c, seconds: next } : c));
}

/**
 * Append a 1s cut, funded by unspent seconds under the ceiling — never by shortening an existing
 * one. Refused when the ladder is already full.
 *
 * DEFERRED — nothing calls this today. The operator asked for "Add cut" to come out of the UI
 * (2026-09-03): the Multishot node's card and focus view both dropped the affordance, but the
 * logic is exactly the kind of thing worth keeping ready rather than reinventing once the flow
 * wants it again. Its tests still run, so it cannot rot silently.
 */
export function addCut(cuts: MultishotCut[]): MultishotCut[] {
  if (headroomOf(cuts) < MIN_CUT_SECONDS) return cuts;
  return [...cuts, newCut("", MIN_CUT_SECONDS)];
}

/**
 * Remove a cut. The ladder shortens by exactly its seconds — nobody inherits them, for the same
 * reason resizing takes from nobody: the operator sees the change they asked for and nothing
 * else. Those seconds become headroom another cut can grow into. The last cut cannot be removed.
 */
export function removeCut(cuts: MultishotCut[], index: number): MultishotCut[] {
  if (cuts.length <= 1 || index < 0 || index >= cuts.length) return cuts;
  return cuts.filter((_, i) => i !== index);
}
