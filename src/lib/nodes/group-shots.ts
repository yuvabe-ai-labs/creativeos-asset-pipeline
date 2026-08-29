import type { ReelShot } from "./reel-script";

/** Gemini Omni's documented duration range. Both ends bind — see the rebalance below. */
export const OMNI_MIN_SECONDS = 3;
export const OMNI_MAX_SECONDS = 10;
/** What a shot with no usable length is worth for packing. Shown as assumed, not parsed. */
export const ASSUMED_SHOT_SECONDS = 4;

export type ShotGroup = {
  shotIndexes: number[];
  seconds: number;
  /** The group was under the floor and nothing could be moved into it — `seconds` was raised. */
  clamped: boolean;
  /** A single shot longer than the ceiling. Kept whole; the request clamps it. */
  overCap: boolean;
};

export function shotSeconds(shot: ReelShot): number {
  const n = Number(shot.duration_seconds);
  return Number.isFinite(n) && n > 0 ? n : ASSUMED_SHOT_SECONDS;
}

/**
 * Move shots forward out of the previous group until the final group clears the floor.
 *
 * Greedy packing respects the ceiling but can strand a remainder under it: lengths 3,5,6,4,2 pack
 * to 8 / 10 / 2, and that 2s tail cannot merge backward because the block before it is already at
 * the cap. Pulling the previous group's LAST shot forward fixes both ends at once — 8 / 6 / 6.
 *
 * Stops rather than creating a new problem: never empties the previous group, and never pushes the
 * final group over the ceiling.
 */
function rebalanceTrailing(groups: ShotGroup[], lengths: number[]): void {
  while (groups.length >= 2) {
    const last = groups[groups.length - 1];
    if (last.seconds >= OMNI_MIN_SECONDS) return;

    const prev = groups[groups.length - 2];
    if (prev.shotIndexes.length < 2) return;

    const moved = prev.shotIndexes[prev.shotIndexes.length - 1];
    const movedLength = lengths[moved];
    if (last.seconds + movedLength > OMNI_MAX_SECONDS) return;

    prev.shotIndexes = prev.shotIndexes.slice(0, -1);
    prev.seconds -= movedLength;
    last.shotIndexes = [moved, ...last.shotIndexes];
    last.seconds += movedLength;
  }
}

/**
 * D193 — consecutive, greedy, then rebalanced. Deliberately not seam-aware.
 *
 * Finding good narrative seams was a planner's job, and its failures were invisible: a plan could
 * be internally consistent and still lose footage. Packing by arithmetic is legible instead — the
 * operator sees the groups as nodes and corrects them with the toggle, where the work already is.
 *
 * Shot count is conserved: every index appears exactly once, in order.
 */
export function groupShotsForFanOut(shots: ReelShot[]): ShotGroup[] {
  if (shots.length === 0) return [];

  const lengths = shots.map(shotSeconds);
  const groups: ShotGroup[] = [];
  let current: number[] = [];
  let total = 0;

  lengths.forEach((length, index) => {
    // `current.length > 0` keeps a single over-cap shot in its own group rather than looping
    // forever trying to fit it.
    if (current.length > 0 && total + length > OMNI_MAX_SECONDS) {
      groups.push({ shotIndexes: current, seconds: total, clamped: false, overCap: false });
      current = [];
      total = 0;
    }
    current.push(index);
    total += length;
  });
  if (current.length > 0) {
    groups.push({ shotIndexes: current, seconds: total, clamped: false, overCap: false });
  }

  rebalanceTrailing(groups, lengths);

  return groups.map((group) => ({
    ...group,
    // Clamping invents video the script did not ask for, so it only ever runs after the
    // rebalance has failed — a lone sub-floor shot with nothing to borrow from.
    seconds: group.seconds < OMNI_MIN_SECONDS ? OMNI_MIN_SECONDS : group.seconds,
    clamped: group.seconds < OMNI_MIN_SECONDS,
    overCap: group.seconds > OMNI_MAX_SECONDS,
  }));
}
