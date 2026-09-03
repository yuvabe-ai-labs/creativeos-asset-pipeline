// The Multishot node's cut list (D209). Independent cuts sharing one ceiling.
//
// Every mutation here holds two invariants: `totalOf(cuts) <= OMNI_MAX_SECONDS` (Omni's real
// maximum — see group-shots.ts) and every cut's `seconds >= MIN_CUT_SECONDS`. That is DIFFERENT
// from the old rule. Previously the total was a FIXED budget — resizing traded seconds between a
// pair, removing handed them to a neighbour — because the total, once set, was never allowed to
// move. Now the total is free to move anywhere inside the window: growing one cut spends shared
// headroom under the ceiling instead of taking it from a designated partner, and removing a cut
// simply shrinks the total instead of redistributing what it freed.
//
// The truncation risk that motivated the old invariant is still covered, just by a different
// mechanism. The Omni request's `duration` is derived from `totalOf(cuts)` at generation time
// (checkMultishotDuration in resolve-prompt.ts rejects a request whose `duration` disagrees with
// it), so the request and the ladder can never come apart — the duration IS the sum, not a
// separately-typed number that a ladder longer than it could silently outrun.
import type { ReelShot } from "./reel-script";
import { shotSeconds, OMNI_MAX_SECONDS } from "./group-shots";

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

export function totalOf(cuts: MultishotCut[]): number {
  return cuts.reduce((sum, c) => sum + c.seconds, 0);
}

/**
 * The largest `seconds` a call to resizeCut(cuts, index, …) can actually produce.
 *
 * Headroom is shared across the whole list now, not paired with one designated neighbour: this
 * cut's own current length plus whatever room is left before the total hits OMNI_MAX_SECONDS.
 * Floored at MIN_CUT_SECONDS so a list that is already over the ceiling (a lone shot longer than
 * Omni's max — see group-shots.ts) still returns something the Slider can use, rather than a
 * negative or zero max.
 *
 * The Slider uses this to set its effective max, so the thumb can't be dragged past what
 * resizeCut will clamp to. This prevents the dead-track feel of dragging past an invisible ceiling.
 */
export function maxSecondsFor(cuts: MultishotCut[], index: number): number {
  if (index < 0 || index >= cuts.length) return 0;
  const headroom = cuts[index].seconds + (OMNI_MAX_SECONDS - totalOf(cuts));
  return Math.min(OMNI_MAX_SECONDS, Math.max(MIN_CUT_SECONDS, headroom));
}

/**
 * Set one cut's length. No neighbour changes — growing this cut spends headroom under the shared
 * ceiling (see maxSecondsFor), it does not take seconds from anyone. Clamped to at least
 * MIN_CUT_SECONDS and at most maxSecondsFor(cuts, index).
 */
export function resizeCut(
  cuts: MultishotCut[],
  index: number,
  seconds: number,
): MultishotCut[] {
  if (index < 0 || index >= cuts.length) return cuts;

  const next = Math.max(
    MIN_CUT_SECONDS,
    Math.min(Math.round(seconds), maxSecondsFor(cuts, index)),
  );
  if (next === cuts[index].seconds) return cuts;

  return cuts.map((c, i) => (i === index ? { ...c, seconds: next } : c));
}

/**
 * Append a 1s cut, funded by unused headroom under the ceiling — not by taking seconds from the
 * largest existing cut, which was the old fixed-budget behaviour. Refused when there isn't a
 * full MIN_CUT_SECONDS of headroom left under OMNI_MAX_SECONDS.
 *
 * DEFERRED — nothing calls this today. The operator asked for "Add cut" to come out of the UI
 * (2026-09-03): the Multishot node's card and focus view both dropped the affordance, but the
 * logic is exactly the kind of thing worth keeping ready rather than reinventing once the flow
 * wants it again. Its tests still run, so it cannot rot silently.
 */
export function addCut(cuts: MultishotCut[]): MultishotCut[] {
  const headroom = OMNI_MAX_SECONDS - totalOf(cuts);
  if (headroom < MIN_CUT_SECONDS) return cuts;
  return [...cuts, newCut("", MIN_CUT_SECONDS)];
}

/**
 * Remove a cut. The total shrinks by exactly its seconds — nobody inherits them, which is the
 * point: the total is free to move now, so there is nothing to preserve by redistributing. The
 * last remaining cut cannot be removed.
 */
export function removeCut(cuts: MultishotCut[], index: number): MultishotCut[] {
  if (cuts.length <= 1 || index < 0 || index >= cuts.length) return cuts;
  return cuts.filter((_, i) => i !== index);
}
