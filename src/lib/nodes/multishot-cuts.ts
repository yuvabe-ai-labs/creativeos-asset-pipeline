// The Multishot node's cut list (D209). A FIXED budget of seconds divided among cuts.
//
// Every mutation here preserves `sum(seconds)`. That is not tidiness: the Omni request's
// `duration` is derived from the ladder, and a ladder longer than the duration comes back
// TRUNCATED AT FULL PRICE. Holding the total by construction makes that failure unreachable
// instead of something a validator has to catch.
import type { ReelShot } from "./reel-script";
import { shotSeconds } from "./group-shots";

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

/**
 * Select the partner cut for resizing at the given index.
 * Trades with the NEXT cut, or the previous one when resizing the last.
 * Returns -1 if there is no valid partner (single cut).
 */
function getPartnerIndex(cuts: MultishotCut[], index: number): number {
  if (index < 0 || index >= cuts.length) return -1;
  const partnerIndex = index + 1 < cuts.length ? index + 1 : index - 1;
  if (partnerIndex < 0 || partnerIndex >= cuts.length) return -1;
  return partnerIndex;
}

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
 * Set one cut's length, funding the change from a neighbour so the total never moves.
 *
 * Trades with the NEXT cut, or the previous one when resizing the last — which is what makes a
 * handle drawn *between* two cards behave the way it looks like it should.
 */
export function resizeCut(
  cuts: MultishotCut[],
  index: number,
  seconds: number,
): MultishotCut[] {
  const partnerIndex = getPartnerIndex(cuts, index);
  if (partnerIndex < 0) return cuts;

  const pair = cuts[index].seconds + cuts[partnerIndex].seconds;
  // Both ends clamp: the dragged cut cannot go below the floor, and cannot grow so far that
  // its partner does.
  const next = Math.max(MIN_CUT_SECONDS, Math.min(Math.round(seconds), pair - MIN_CUT_SECONDS));
  if (next === cuts[index].seconds) return cuts;

  return cuts.map((c, i) => {
    if (i === index) return { ...c, seconds: next };
    if (i === partnerIndex) return { ...c, seconds: pair - next };
    return c;
  });
}

/**
 * The largest `seconds` a call to resizeCut(cuts, index, …) can actually produce.
 *
 * The Slider uses this to set its effective max, so the thumb can't be dragged past what
 * resizeCut will clamp to. This prevents the dead-track feel of dragging past an invisible ceiling.
 */
export function maxSecondsFor(cuts: MultishotCut[], index: number): number {
  const partnerIndex = getPartnerIndex(cuts, index);
  if (partnerIndex < 0) {
    // No valid partner — the cut cannot grow.
    return cuts[index]?.seconds ?? 0;
  }
  const pair = cuts[index].seconds + cuts[partnerIndex].seconds;
  return pair - MIN_CUT_SECONDS;
}

/**
 * Append a cut, funded by the largest existing one. Refused when nobody can spare a second.
 *
 * DEFERRED — nothing calls this today. The operator asked for "Add cut" to come out of the UI
 * (2026-09-03): the Multishot node's card and focus view both dropped the affordance, but the
 * budget-preserving logic is exactly the kind of thing worth keeping ready rather than
 * reinventing once the flow wants it again. Its tests still run, so it cannot rot silently.
 */
export function addCut(cuts: MultishotCut[]): MultishotCut[] {
  let donor = -1;
  for (let i = 0; i < cuts.length; i++) {
    if (cuts[i].seconds >= MIN_CUT_SECONDS * 2 && (donor === -1 || cuts[i].seconds > cuts[donor].seconds)) {
      donor = i;
    }
  }
  if (donor === -1) return cuts;

  return [
    ...cuts.map((c, i) => (i === donor ? { ...c, seconds: c.seconds - MIN_CUT_SECONDS } : c)),
    newCut("", MIN_CUT_SECONDS),
  ];
}

/** Remove a cut, handing its seconds to a neighbour. The last remaining cut cannot be removed. */
export function removeCut(cuts: MultishotCut[], index: number): MultishotCut[] {
  if (cuts.length <= 1 || index < 0 || index >= cuts.length) return cuts;

  const heirIndex = index + 1 < cuts.length ? index + 1 : index - 1;
  const freed = cuts[index].seconds;
  return cuts
    .map((c, i) => (i === heirIndex ? { ...c, seconds: c.seconds + freed } : c))
    .filter((_, i) => i !== index);
}
