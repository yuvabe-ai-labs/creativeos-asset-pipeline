import type { ReelShot } from "./reel-script";
import { MULTISHOT_MODELS } from "./multishot-models";

/**
 * D258 — the packing window, derived from what the models publish.
 *
 * The ceiling is the WIDEST window any multishot model offers, so packing never splits a run of
 * shots that some model could have generated in one go. The floor is the lowest minimum, so a
 * packed group is never born shorter than every model will accept.
 *
 * Derived, not authored: a fourth model, or a vendor moving a limit, changes packing with no edit
 * here. That is D235's own rule — an invented limit and a published one must not be
 * indistinguishable at the call site — now applied to grouping, which D235 itself carved out.
 */
export const PACK_FLOOR_SECONDS = Math.min(...MULTISHOT_MODELS.map((m) => m.minTotalSeconds));
export const PACK_CEILING_SECONDS = Math.max(...MULTISHOT_MODELS.map((m) => m.maxTotalSeconds));

/**
 * What v1 Script nodes were packed at (D257).
 *
 * A fact about rows already on disk, NOT a claim about any model, so it is authored and must never
 * be re-derived from the table. Naming it after Omni would make it look like it tracks Omni's
 * window; it does not, and Omni's window moving must not silently repack old canvases.
 */
export const LEGACY_PACK_CEILING = 10;

/** What a shot with no usable length is worth for packing. Shown as assumed, not parsed. */
export const ASSUMED_SHOT_SECONDS = 4;

export type ShotGroup = {
  shotIndexes: number[];
  seconds: number;
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
 * Stops rather than creating a new problem: never empties the previous group, never pushes the
 * final group over the ceiling, and never drops the group it steals from below the floor. When any
 * of those would happen, the tail is left to the clamp instead — one invented second is cheaper
 * than two plus a wrecked neighbour.
 */
function rebalanceTrailing(groups: ShotGroup[], lengths: number[], ceiling: number): void {
  while (groups.length >= 2) {
    const last = groups[groups.length - 1];
    if (last.seconds >= PACK_FLOOR_SECONDS) return;

    const prev = groups[groups.length - 2];
    if (prev.shotIndexes.length < 2) return;

    const moved = prev.shotIndexes[prev.shotIndexes.length - 1];
    const movedLength = lengths[moved];
    if (last.seconds + movedLength > ceiling) return;
    // ...and never strand the group it steals FROM. Robbing a healthy group to lift the tail can
    // leave the robbed one under the floor, which is strictly worse than not rebalancing: lengths
    // [1, 8, 2] would move the 8s shot forward, orphan a 1s group, and clamp it — two invented
    // seconds instead of the one that simply clamping the tail costs. Stopping here leaves the
    // tail to the clamp, which is the cheaper repair.
    if (prev.seconds - movedLength < PACK_FLOOR_SECONDS) return;

    prev.shotIndexes = prev.shotIndexes.slice(0, -1);
    prev.seconds -= movedLength;
    last.shotIndexes = [moved, ...last.shotIndexes];
    last.seconds += movedLength;
  }
}

/**
 * D214 — consecutive, greedy, then rebalanced. Deliberately not seam-aware.
 *
 * Finding good narrative seams was a planner's job, and its failures were invisible: a plan could
 * be internally consistent and still lose footage. Packing by arithmetic is legible instead — the
 * operator sees the groups as nodes and corrects them with the toggle, where the work already is.
 *
 * Shot count is conserved: every index appears exactly once, in order.
 */
export function groupShotsForFanOut(
  shots: ReelShot[],
  ceiling: number = LEGACY_PACK_CEILING,
): ShotGroup[] {
  if (shots.length === 0) return [];

  const lengths = shots.map(shotSeconds);
  const groups: ShotGroup[] = [];
  let current: number[] = [];
  let total = 0;

  lengths.forEach((length, index) => {
    // `current.length > 0` keeps a single over-cap shot in its own group rather than looping
    // forever trying to fit it.
    if (current.length > 0 && total + length > ceiling) {
      groups.push({ shotIndexes: current, seconds: total });
      current = [];
      total = 0;
    }
    current.push(index);
    total += length;
  });
  if (current.length > 0) {
    groups.push({ shotIndexes: current, seconds: total });
  }

  rebalanceTrailing(groups, lengths, ceiling);

  return groups.map((group) => ({
    ...group,
    // Clamping invents video the script did not ask for, so it only ever runs after the
    // rebalance has failed — a lone sub-floor shot with nothing to borrow from.
    seconds: group.seconds < PACK_FLOOR_SECONDS ? PACK_FLOOR_SECONDS : group.seconds,
  }));
}

export type Generation = {
  /** 0-based; display as index + 1. */
  index: number;
  shotIndexes: number[];
  /** Packed length, already clamped to the Omni window. */
  seconds: number;
  /** The override if one is set for this exact grouping, else the default. */
  multishot: boolean;
  /** Identity of this grouping, and the key an override is stored under. */
  key: string;
};

/**
 * A generation's identity: the exact set of script rows it covers.
 *
 * Deliberately derived from the shot indexes rather than being a minted id. A generation is not
 * a thing the operator creates — it is what the packing produces from the current parse, so its
 * identity has to change when the packing does. That is what makes a stale override harmless.
 */
export function generationKey(shotIndexes: number[]): string {
  return shotIndexes.join("-");
}

/**
 * D227 — the generations the script will fan out to, with each one's mode.
 *
 * Derived from `groupShotsForFanOut`, not from a parallel rule, so what the Visual script list
 * shows is exactly what fan-out will do. A label computed independently would drift, and its
 * whole purpose is to let the operator see and set the plan before committing to it.
 *
 * `overrides` holds ONLY deviations from the default (a group of >1 row is multishot). An
 * override whose key matches no current generation is ignored: after a re-parse the grouping it
 * described no longer exists, and applying it to a differently-shaped group would carry an
 * intent onto rows it was never about.
 */
export function describeGenerations(
  shots: ReelShot[],
  overrides?: Record<string, boolean>,
): Generation[] {
  return groupShotsForFanOut(shots).map((group, index) => {
    const key = generationKey(group.shotIndexes);
    const override = overrides?.[key];
    return {
      index,
      shotIndexes: group.shotIndexes,
      seconds: group.seconds,
      multishot: typeof override === "boolean" ? override : group.shotIndexes.length > 1,
      key,
    };
  });
}
