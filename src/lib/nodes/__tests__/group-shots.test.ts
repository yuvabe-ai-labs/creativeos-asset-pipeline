import { describe, it, expect } from "vitest";
import { groupShotsForFanOut, shotSeconds } from "../group-shots";
import type { ReelShot } from "../reel-script";

const shots = (...lengths: number[]): ReelShot[] =>
  lengths.map((n, i) => ({ description: `shot ${i + 1}`, duration_seconds: n }));

const shape = (gs: ReturnType<typeof groupShotsForFanOut>) =>
  gs.map((g) => ({ idx: g.shotIndexes, s: g.seconds }));

describe("shotSeconds", () => {
  it("reads duration_seconds", () => {
    expect(shotSeconds({ duration_seconds: 6 })).toBe(6);
  });

  // The Shot node shows this as assumed rather than parsed.
  it("falls back to 4 when absent, zero, or unparseable", () => {
    expect(shotSeconds({})).toBe(4);
    expect(shotSeconds({ duration_seconds: 0 })).toBe(4);
    expect(shotSeconds({ duration_seconds: Number.NaN })).toBe(4);
  });
});

describe("groupShotsForFanOut", () => {
  it("returns nothing for an empty script", () => {
    expect(groupShotsForFanOut([])).toEqual([]);
  });

  it("packs consecutive shots up to the 10s ceiling", () => {
    expect(shape(groupShotsForFanOut(shots(4, 5, 4)))).toEqual([
      { idx: [0, 1], s: 9 },
      { idx: [2], s: 4 },
    ]);
  });

  // THE FIXTURE. A real client script (CHUPPS "Where are you headed?") whose lengths strand a
  // 2s remainder below Omni's 3s floor that cannot merge backward — block 2 is already at 10.
  // Greedy alone gives [0,1]=8, [2,3]=10, [4]=2. The rebalance must move shot 3 forward.
  it("rebalances a trailing block that lands under the 3s floor", () => {
    expect(shape(groupShotsForFanOut(shots(3, 5, 6, 4, 2)))).toEqual([
      { idx: [0, 1], s: 8 },
      { idx: [2], s: 6 },
      { idx: [3, 4], s: 6 },
    ]);
  });

  it("never leaves a group below the floor unflagged", () => {
    for (const g of groupShotsForFanOut(shots(3, 5, 6, 4, 2))) {
      expect(g.seconds).toBeGreaterThanOrEqual(3);
      expect(g.clamped).toBe(false);
    }
  });

  // Robbing a healthy group to lift the tail can strand the group it stole from. [1,8,2] greedily
  // packs to 9s + 2s; moving the 8s shot forward would orphan a 1s group and clamp it — two
  // invented seconds instead of the one that clamping the tail alone costs. The rebalance must
  // decline the move.
  it("declines a move that would strand the group it steals from", () => {
    expect(shape(groupShotsForFanOut(shots(1, 8, 2)))).toEqual([
      { idx: [0, 1], s: 9 },
      { idx: [2], s: 3 },
    ]);
  });

  it("flags that stranded-tail clamp rather than hiding it", () => {
    const groups = groupShotsForFanOut(shots(1, 8, 2));
    expect(groups.map((g) => g.clamped)).toEqual([false, true]);
  });

  // Nothing to rebalance from — clamp up and say so, rather than request an illegal 2s.
  it("clamps a lone sub-floor shot and flags it", () => {
    expect(groupShotsForFanOut(shots(2))).toEqual([
      { shotIndexes: [0], seconds: 3, clamped: true, overCap: false },
    ]);
  });

  // Where to cut a 14s shot is a creative decision, not an arithmetic one — never split silently.
  it("keeps an over-cap single shot whole and flags it", () => {
    expect(groupShotsForFanOut(shots(14))).toEqual([
      { shotIndexes: [0], seconds: 14, clamped: false, overCap: true },
    ]);
  });

  it("conserves every shot exactly once, in order", () => {
    const lengths = [3, 5, 6, 4, 2, 7, 1, 9];
    const flat = groupShotsForFanOut(shots(...lengths)).flatMap((g) => g.shotIndexes);
    expect(flat).toEqual(lengths.map((_, i) => i));
  });

  it("treats a shot with no length as 4s for packing", () => {
    expect(shape(groupShotsForFanOut([{}, {}, {}]))).toEqual([
      { idx: [0, 1], s: 8 },
      { idx: [2], s: 4 },
    ]);
  });
});
