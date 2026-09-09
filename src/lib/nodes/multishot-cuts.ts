// The Multishot node's cut list (D230, D235). One shared ceiling, no separate "total" to
// reconcile (operator request 2026-09-03).
//
// The model, in one line: **the ladder may run up to the TARGET MODEL's `maxTotalSeconds`, and
// each cut grows into whatever is unspent.** There is no Total control — the clip's length simply
// IS the sum of its cuts, so there are never two numbers to keep in agreement.
//
// The ceiling is a parameter, not a constant (D235). Every function that spends against it takes
// a `MultishotCapability`; callers get one from `multishotCapabilityFor(node.targetModel)`. There
// is deliberately no default value on that parameter — a caller that forgets it would silently
// get Omni's 10s, which on a Kling node is a ladder the operator cannot fill and no test would
// notice. Making it required means the compiler enumerates every call site.
//
// What this module guarantees, for a given capability `cap`:
//   - every cut's `seconds >= cap.minCutSeconds`
//   - `totalOf(cuts) <= cap.maxTotalSeconds` after any mutation
//   - **resizing a cut NEVER changes another cut**
//
// That last one is the operator's explicit requirement, and it is why there is no
// redistribution: a slider that silently moves a different slider is a surprise, and a surprise
// in a control that decides what gets billed is worse than a limit you can see. When the ladder
// is full, a cut simply stops growing and the view says to shorten another one — the limit is
// stated rather than worked around.
//
// SWITCHING MODELS DOES NOT MUTATE THE LADDER (D237). Nothing here re-clamps an existing ladder
// when `targetModel` changes: a 14s Kling ladder switched to Omni keeps its cuts, and
// `checkLadder` (multishot-models.ts) reports the violation instead. Silent clamping is the same
// surprise as redistribution, one level up.
//
// History, so nobody reintroduces a solved argument: this replaced a fixed-budget model where
// cuts traded seconds pairwise, and then a two-number model with an explicit Total plus a
// remainder and a "Fit to total" action. Both were rejected for the same reason — they made one
// control's movement depend on another's.
import type { ReelShot } from "./reel-script";
import { shotSeconds } from "./group-shots";
import type { MultishotCapability } from "./multishot-models";

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

/**
 * The parse-time cut floor.
 *
 * Kept as a constant on purpose, for the same reason `group-shots.ts` is not parameterised:
 * `cutsFromShots` runs when a script is parsed, before any Multishot node exists and therefore
 * before a model is chosen. Both capabilities declare `minCutSeconds: 1`, so this agrees with
 * both today; if a model ever declares a higher floor, `checkLadder` reports the violation on a
 * node built before that model was chosen, which is the correct place for it to surface.
 *
 * Every OTHER floor check reads `cap.minCutSeconds`. Do not reintroduce this constant into them.
 */
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

/** Clamps a seconds value into the target model's window. Used when seeding a node's stored total. */
export function clampTotal(seconds: number, cap: MultishotCapability): number {
  return Math.min(cap.maxTotalSeconds, Math.max(cap.minTotalSeconds, Math.round(seconds)));
}

/** How many seconds are still unspent under the ceiling. Zero once the ladder is full. */
export function headroomOf(cuts: MultishotCut[], cap: MultishotCapability): number {
  return Math.max(0, cap.maxTotalSeconds - totalOf(cuts));
}

/**
 * The largest `seconds` a call to `resizeCut(cuts, index, …)` can actually produce: this cut's
 * own length plus whatever is unspent under the capability's ceiling.
 *
 * The ceiling is shared across the whole ladder rather than owned per cut, so a cut can grow only
 * as far as the free seconds allow. When the ladder is already full this returns the cut's current
 * length, so `resizeCut` refuses to grow it and the view tells the operator to shorten another cut.
 *
 * NOT the Slider's `max`. The focus view runs every cut's slider on a fixed 1-`cap.maxTotalSeconds`
 * scale instead, because a max derived from live headroom made an untouched cut's thumb jump when
 * a different cut grew — the track shrank under a value that had not changed, which reads as one
 * slider having moved another. The view accepts a short over-drag that this clamps, in exchange
 * for a scale that means the same thing on every row.
 */
export function maxSecondsFor(
  cuts: MultishotCut[],
  index: number,
  cap: MultishotCapability,
): number {
  if (index < 0 || index >= cuts.length) return 0;
  return Math.max(cap.minCutSeconds, cuts[index].seconds + headroomOf(cuts, cap));
}

/**
 * Set one cut's length.
 *
 * NO NEIGHBOUR EVER CHANGES. Growing a cut spends free seconds under the ceiling; it never takes
 * them from another cut. That was the operator's explicit objection to the earlier
 * budget-redistribution model — a slider that silently moves another slider is a surprise, and a
 * surprise in a control that decides what gets billed is worse than a limit you can see.
 *
 * Clamped to [cap.minCutSeconds, maxSecondsFor(cuts, index, cap)].
 */
export function resizeCut(
  cuts: MultishotCut[],
  index: number,
  seconds: number,
  cap: MultishotCapability,
): MultishotCut[] {
  if (index < 0 || index >= cuts.length) return cuts;

  const next = Math.max(
    cap.minCutSeconds,
    Math.min(Math.round(seconds), maxSecondsFor(cuts, index, cap)),
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
export function addCut(cuts: MultishotCut[], cap: MultishotCapability): MultishotCut[] {
  if (headroomOf(cuts, cap) < cap.minCutSeconds) return cuts;
  // Also refused once the model's cut cap is reached — on Kling a 7th cut is a rejection, not a
  // quality hint. `addCut` has no caller today (see below) but must not be the one path that
  // builds an illegal ladder when it gets one.
  if (cap.maxCuts !== null && cuts.length >= cap.maxCuts) return cuts;
  return [...cuts, newCut("", cap.minCutSeconds)];
}

/**
 * Remove a cut. The ladder shortens by exactly its seconds — nobody inherits them, for the same
 * reason resizing takes from nobody: the operator sees the change they asked for and nothing
 * else. Those seconds become headroom another cut can grow into. The last cut cannot be removed.
 *
 * DEFERRED — nothing calls this today, for the same reason and on the same terms as `addCut`
 * above. The operator asked for the per-cut "X" to come out of the Multishot focus view
 * (2026-09-04); the affordance is gone, the logic is kept ready, and its tests still run.
 */
export function removeCut(cuts: MultishotCut[], index: number): MultishotCut[] {
  if (cuts.length <= 1 || index < 0 || index >= cuts.length) return cuts;
  return cuts.filter((_, i) => i !== index);
}
