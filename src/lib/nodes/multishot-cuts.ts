// The Multishot node's cut list (D209), reworked into Kling's advanced multi-shot model
// (operator request 2026-09-03): an explicit, operator-set TOTAL for the clip, with cuts
// allocating AGAINST it rather than defining it.
//
// `totalSeconds` (the Total) and `totalOf(cuts)` (allocated) are now two independent numbers,
// not one derived from the other. The guarantees this module actually holds:
//   - every cut's `seconds >= MIN_CUT_SECONDS`
//   - `totalSeconds` itself is kept inside Omni's window by `clampTotal` wherever it is set
//   - resizing or removing a cut never PUSHES allocated further from the total than it already
//     was — resizeCut's ceiling is capped at the total, and removeCut only ever shrinks
// Allocated is allowed to sit BELOW the total (the gap is the remainder the focus view shows
// live, e.g. "6 of 8s · 2s left") or ABOVE it (shown as "Xs over", typically right after the
// operator drags the Total down under what is already allocated). Neither state is corrected
// automatically — that would mean a drag on one control silently moving another, which is
// exactly what the operator objected to. `fitToTotal` is the one explicit, operator-triggered
// action that reconciles them, snapping allocated to equal the total in a single step.
//
// This is a deliberate reversal of the previous rule (commit e2f3be8a), which made totalSeconds
// a derived mirror of totalOf(cuts) and required every write to `cuts` to also rewrite
// totalSeconds := totalOf(next). That coupling is gone: totalSeconds now changes ONLY when the
// operator moves the Total control (or a fresh node is seeded — see multishot-convert.ts /
// canvas-store.ts's fanOutShots, which seed cuts so the two start out equal).
//
// The truncation risk the old rule guarded against is still covered, just at a different moment:
// generation is blocked until allocated === total (see the Multishot Prompt focus view and
// checkMultishotDuration in resolve-prompt.ts), so by the time a request is actually sent, the
// cut ladder and the request duration are equal by construction — same guarantee, enforced at
// the point that spends money instead of on every keystroke.
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

/** What is currently ALLOCATED across the ladder — distinct from `totalSeconds`, the Total the
 *  operator set. The gap between the two is the remainder the focus view surfaces. */
export function totalOf(cuts: MultishotCut[]): number {
  return cuts.reduce((sum, c) => sum + c.seconds, 0);
}

/** Clamps a Total into Omni's window. The only place `totalSeconds` is validated — every write
 *  to it (the operator dragging the Total slider, or a fresh node being seeded) should go
 *  through this so the stored value can never drift outside 3-10s. */
export function clampTotal(seconds: number): number {
  return Math.min(OMNI_MAX_SECONDS, Math.max(OMNI_MIN_SECONDS, Math.round(seconds)));
}

/**
 * The largest `seconds` a call to resizeCut(cuts, index, …, totalSeconds) can actually produce.
 *
 * Headroom is shared across the whole list against the given TOTAL (the operator's independent
 * target), not a fixed OMNI_MAX_SECONDS ceiling: this cut's own current length plus whatever
 * room is left before allocated hits `totalSeconds`. Floored at MIN_CUT_SECONDS so a list that
 * is already over-allocated relative to the total still returns something the Slider can use,
 * rather than a negative or zero max.
 *
 * The Slider uses this to set its effective max, so the thumb can't be dragged past what
 * resizeCut will clamp to. This prevents the dead-track feel of dragging past an invisible ceiling.
 */
export function maxSecondsFor(
  cuts: MultishotCut[],
  index: number,
  totalSeconds: number,
): number {
  if (index < 0 || index >= cuts.length) return 0;
  const headroom = cuts[index].seconds + (totalSeconds - totalOf(cuts));
  return Math.max(MIN_CUT_SECONDS, headroom);
}

/**
 * Set one cut's length. No neighbour changes — growing this cut spends headroom under the given
 * TOTAL (see maxSecondsFor), it does not take seconds from anyone, and it never touches
 * `totalSeconds` itself. Clamped to at least MIN_CUT_SECONDS and at most
 * maxSecondsFor(cuts, index, totalSeconds).
 */
export function resizeCut(
  cuts: MultishotCut[],
  index: number,
  seconds: number,
  totalSeconds: number,
): MultishotCut[] {
  if (index < 0 || index >= cuts.length) return cuts;

  const next = Math.max(
    MIN_CUT_SECONDS,
    Math.min(Math.round(seconds), maxSecondsFor(cuts, index, totalSeconds)),
  );
  if (next === cuts[index].seconds) return cuts;

  return cuts.map((c, i) => (i === index ? { ...c, seconds: next } : c));
}

/**
 * Append a 1s cut, funded by unused headroom under the given TOTAL — not by taking seconds from
 * the largest existing cut, which was the old fixed-budget behaviour. Refused when there isn't a
 * full MIN_CUT_SECONDS of headroom left under `totalSeconds`.
 *
 * DEFERRED — nothing calls this today. The operator asked for "Add cut" to come out of the UI
 * (2026-09-03): the Multishot node's card and focus view both dropped the affordance, but the
 * logic is exactly the kind of thing worth keeping ready rather than reinventing once the flow
 * wants it again. Its tests still run, so it cannot rot silently.
 */
export function addCut(cuts: MultishotCut[], totalSeconds: number): MultishotCut[] {
  const headroom = totalSeconds - totalOf(cuts);
  if (headroom < MIN_CUT_SECONDS) return cuts;
  return [...cuts, newCut("", MIN_CUT_SECONDS)];
}

/**
 * Remove a cut. Allocated shrinks by exactly its seconds — nobody inherits them, and
 * `totalSeconds` (the Total) is untouched: it is the operator's field, not a function of the
 * ladder. The last remaining cut cannot be removed.
 */
export function removeCut(cuts: MultishotCut[], index: number): MultishotCut[] {
  if (cuts.length <= 1 || index < 0 || index >= cuts.length) return cuts;
  return cuts.filter((_, i) => i !== index);
}

/**
 * Distributes `amount` extra seconds across `cuts`, proportional to each cut's current share of
 * the list, landing EXACTLY on `amount` via the largest-remainder method: floor every raw share,
 * then hand the leftover seconds one at a time to the cuts with the largest fractional share
 * (ties broken toward the lower index, for a deterministic result independent of iteration order).
 */
function distributeGrowth(cuts: MultishotCut[], amount: number): MultishotCut[] {
  const current = totalOf(cuts);
  const raw = cuts.map((c) => (amount * c.seconds) / current);
  const floors = raw.map(Math.floor);
  const used = floors.reduce((a, b) => a + b, 0);
  const remainder = amount - used;

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const add = new Array(cuts.length).fill(0) as number[];
  for (let k = 0; k < remainder; k++) add[order[k].i] += 1;

  return cuts.map((c, i) => ({ ...c, seconds: c.seconds + floors[i] + add[i] }));
}

/**
 * The mirror of distributeGrowth for over-allocation: distributes `amount` seconds of shrink
 * proportional to each cut's SLACK above MIN_CUT_SECONDS (not its raw length), so a cut already
 * at the floor never gets asked to go negative. `amount` is guaranteed by the caller (fitToTotal)
 * to be no more than the list's total slack, so every increment below always has somewhere left
 * to land — the while-loop's lap counter is a defensive bound, not a real retry path.
 */
function distributeShrink(cuts: MultishotCut[], amount: number): MultishotCut[] {
  const slack = cuts.map((c) => c.seconds - MIN_CUT_SECONDS);
  const totalSlack = slack.reduce((a, b) => a + b, 0);
  if (totalSlack <= 0) return cuts;

  const raw = slack.map((s) => (amount * s) / totalSlack);
  const floors = raw.map(Math.floor);
  const used = floors.reduce((a, b) => a + b, 0);
  let remainder = amount - used;

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const sub = new Array(cuts.length).fill(0) as number[];
  let lap = 0;
  const maxLaps = order.length * (amount + 2); // defensive bound; capacity math guarantees termination well before this
  while (remainder > 0 && lap < maxLaps) {
    const { i } = order[lap % order.length];
    if (floors[i] + sub[i] < slack[i]) {
      sub[i] += 1;
      remainder -= 1;
    }
    lap += 1;
  }

  return cuts.map((c, i) => ({ ...c, seconds: c.seconds - floors[i] - sub[i] }));
}

/**
 * The "Fit to total" action: the ONE explicit, operator-triggered step that reconciles allocated
 * with the Total. Returns cuts whose sum is EXACTLY `totalSeconds`, every cut still
 * `>= MIN_CUT_SECONDS`, distributing the difference proportionally with deterministic rounding
 * (see distributeGrowth / distributeShrink).
 *
 * Edge case: if `cuts.length * MIN_CUT_SECONDS > totalSeconds` (more cuts than the requested
 * total can fund even at the floor — only reachable by dragging the Total down under a list of
 * many short cuts), the two invariants "sum == totalSeconds" and "every cut >= MIN_CUT_SECONDS"
 * cannot both hold. The min-cut invariant wins: the result holds at the achievable floor
 * (cuts.length * MIN_CUT_SECONDS) rather than manufacturing a sub-1s cut, and the resulting
 * "still over" state is left for the focus view's allocation bar to surface like any other
 * unbalanced state, since it can't be resolved without deleting cuts.
 */
export function fitToTotal(cuts: MultishotCut[], totalSeconds: number): MultishotCut[] {
  if (cuts.length === 0) return cuts;

  const current = totalOf(cuts);
  const floor = cuts.length * MIN_CUT_SECONDS;
  const target = Math.max(totalSeconds, floor);
  if (current === target) return cuts;

  const diff = target - current;
  return diff > 0 ? distributeGrowth(cuts, diff) : distributeShrink(cuts, -diff);
}
