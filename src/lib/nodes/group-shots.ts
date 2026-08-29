import type { ReelShot } from "./reel-script";

/** Gemini Omni's documented duration range. Both ends bind — see the rebalance below. */
export const OMNI_MIN_SECONDS = 3;
export const OMNI_MAX_SECONDS = 10;
/** What a shot with no usable length is worth for packing. Shown as assumed, not parsed. */
export const ASSUMED_SHOT_SECONDS = 4;

export type ShotGroup = {
  shotIndexes: number[];
  seconds: number;
  /** Under the floor with no safe shot to borrow — `seconds` was raised to the floor. */
  clamped: boolean;
  /** A single shot longer than the ceiling. Kept whole; the request clamps it. */
  overCap: boolean;
};

export function shotSeconds(shot: ReelShot): number {
  const n = Number(shot.duration_seconds);
  return Number.isFinite(n) && n > 0 ? n : ASSUMED_SHOT_SECONDS;
}

/**
 * The atom of packing: a whole BEAT, or a single shot when the parse gave no beats.
 *
 * Packing beats rather than shots is what keeps a generation seam on a cut the script already
 * wanted. A seam is the one join the model never sees both sides of, so it belongs at a boundary
 * the script chose — never inside a beat written as continuous (D199).
 */
type PackUnit = { shotIndexes: number[]; seconds: number };

const unitSeconds = (units: PackUnit[]): number =>
  units.reduce((total, unit) => total + unit.seconds, 0);

/**
 * Consecutive shots sharing a `beat_index` become one unit.
 *
 * A shot with no `beat_index` is its own unit, which is what makes this behave identically to the
 * pre-D199 shot-by-shot packing on scripts parsed before the parse learned about beats.
 */
function buildUnits(shots: ReelShot[], lengths: number[]): PackUnit[] {
  const units: PackUnit[] = [];
  let openBeat: number | undefined;

  shots.forEach((shot, index) => {
    const beat = shot.beat_index;
    const continues = beat !== undefined && beat === openBeat && units.length > 0;
    if (continues) {
      const unit = units[units.length - 1];
      unit.shotIndexes.push(index);
      unit.seconds += lengths[index];
      return;
    }
    units.push({ shotIndexes: [index], seconds: lengths[index] });
    openBeat = beat;
  });

  return units;
}

/**
 * A beat too long for one generation is packed greedily inside itself — and only that beat.
 *
 * Splitting a beat is the one thing D199 permits reluctantly: a beat over the ceiling cannot be
 * generated whole, so the alternative is not generating it.
 */
function splitOverCapUnits(units: PackUnit[], lengths: number[]): PackUnit[] {
  const out: PackUnit[] = [];

  for (const unit of units) {
    if (unit.seconds <= OMNI_MAX_SECONDS || unit.shotIndexes.length === 1) {
      out.push(unit);
      continue;
    }
    let current: number[] = [];
    let total = 0;
    for (const index of unit.shotIndexes) {
      if (current.length > 0 && total + lengths[index] > OMNI_MAX_SECONDS) {
        out.push({ shotIndexes: current, seconds: total });
        current = [];
        total = 0;
      }
      current.push(index);
      total += lengths[index];
    }
    if (current.length > 0) out.push({ shotIndexes: current, seconds: total });
  }

  return out;
}

/**
 * Move whole units forward out of the previous group until the final group clears the floor.
 *
 * Greedy packing respects the ceiling but can strand a remainder under it: lengths 3,5,6,4,2 pack
 * to 8 / 10 / 2, and that 2s tail cannot merge backward because the group before it is already at
 * the cap. Pulling the previous group's LAST unit forward fixes both ends at once — 8 / 6 / 6.
 *
 * Stops rather than creating a new problem: never empties the previous group, never pushes the
 * final group over the ceiling, and never drops the group it steals from below the floor. When any
 * of those would happen, the tail is left to the clamp instead — one invented second is cheaper
 * than two plus a wrecked neighbour.
 */
function rebalanceTrailing(groups: PackUnit[][]): void {
  while (groups.length >= 2) {
    const last = groups[groups.length - 1];
    if (unitSeconds(last) >= OMNI_MIN_SECONDS) return;

    const prev = groups[groups.length - 2];
    if (prev.length < 2) return;

    const moved = prev[prev.length - 1];
    if (unitSeconds(last) + moved.seconds > OMNI_MAX_SECONDS) return;
    // ...and never strand the group it steals FROM. Robbing a healthy group to lift the tail can
    // leave the robbed one under the floor, which is strictly worse than not rebalancing: lengths
    // [1, 8, 2] would move the 8s shot forward, orphan a 1s group, and clamp it — two invented
    // seconds instead of the one that simply clamping the tail costs. Stopping here leaves the
    // tail to the clamp, which is the cheaper repair.
    if (unitSeconds(prev) - moved.seconds < OMNI_MIN_SECONDS) return;

    prev.pop();
    last.unshift(moved);
  }
}

/**
 * D193/D199 — pack whole beats to the ceiling, then rebalance the tail.
 *
 * Deliberately not seam-*seeking*: it does not read the script looking for good places to cut.
 * That was a planner's job and its failures were invisible — a plan could be internally consistent
 * and still lose footage. It is seam-*respecting* instead, which needs no judgement: the parse
 * already recorded where the script's own act boundaries are, and packing whole beats keeps every
 * generation seam on one of them. The operator sees the result as nodes and corrects it with the
 * toggle, where the work already is.
 *
 * Shot count is conserved: every index appears exactly once, in order.
 */
export function groupShotsForFanOut(shots: ReelShot[]): ShotGroup[] {
  if (shots.length === 0) return [];

  const lengths = shots.map(shotSeconds);
  const units = splitOverCapUnits(buildUnits(shots, lengths), lengths);

  const groups: PackUnit[][] = [];
  let current: PackUnit[] = [];

  for (const unit of units) {
    // `current.length > 0` keeps a single over-cap unit in its own group rather than looping
    // forever trying to fit it.
    if (current.length > 0 && unitSeconds(current) + unit.seconds > OMNI_MAX_SECONDS) {
      groups.push(current);
      current = [];
    }
    current.push(unit);
  }
  if (current.length > 0) groups.push(current);

  rebalanceTrailing(groups);

  return groups.map((group) => {
    const seconds = unitSeconds(group);
    return {
      shotIndexes: group.flatMap((unit) => unit.shotIndexes),
      // Clamping invents video the script did not ask for, so it only ever runs after the
      // rebalance has failed — a lone sub-floor unit with nothing to borrow from.
      seconds: seconds < OMNI_MIN_SECONDS ? OMNI_MIN_SECONDS : seconds,
      clamped: seconds < OMNI_MIN_SECONDS,
      overCap: seconds > OMNI_MAX_SECONDS,
    };
  });
}

export type ShotGroupingLabel = {
  /** 0-based index of the generation this shot lands in. */
  groupIndex: number;
  /** True when this shot shares its generation with others — a multishot group. */
  multishot: boolean;
  /** What the Visual script list shows beside the shot's duration. */
  label: string;
};

/**
 * D200 — per-shot grouping labels for the parsed Visual script list.
 *
 * Derived from `groupShotsForFanOut`, not from a parallel rule, so what the list says is exactly
 * what fan-out will do. A label computed independently would drift, and the label's whole purpose
 * is to let the operator see the plan before committing to it.
 *
 * Read-only: it reflects the grouping rather than setting it. The control that changes grouping is
 * the Shot node's multishot toggle, after fan-out.
 *
 * Indexed to match `shots` — entry `i` describes shot `i`.
 */
export function describeShotGrouping(shots: ReelShot[]): ShotGroupingLabel[] {
  const labels: ShotGroupingLabel[] = [];

  groupShotsForFanOut(shots).forEach((group, groupIndex) => {
    const multishot = group.shotIndexes.length > 1;
    for (const shotIndex of group.shotIndexes) {
      labels[shotIndex] = {
        groupIndex,
        multishot,
        label: `${multishot ? "Multishot" : "Single"} · Gen ${groupIndex + 1}`,
      };
    }
  });

  return labels;
}
