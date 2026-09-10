import { describe, it, expect } from "vitest";
import {
  groupShotsForFanOut,
  shotSeconds,
  describeGenerations,
  generationKey,
  PACK_CEILING_SECONDS,
  PACK_FLOOR_SECONDS,
  LEGACY_PACK_CEILING,
  CURRENT_GROUPING_VERSION,
  ceilingForVersion,
  defaultMultishotFor,
} from "../group-shots";
import { MULTISHOT_MODELS } from "../multishot-models";
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

  it("never leaves a group below the floor", () => {
    for (const g of groupShotsForFanOut(shots(3, 5, 6, 4, 2))) {
      expect(g.seconds).toBeGreaterThanOrEqual(3);
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

  // Nothing to rebalance from — clamp up rather than request an illegal 2s.
  it("clamps a lone sub-floor shot", () => {
    expect(groupShotsForFanOut(shots(2))).toEqual([
      { shotIndexes: [0], seconds: 3 },
    ]);
  });

  // Where to cut a 14s shot is a creative decision, not an arithmetic one — never split silently.
  it("keeps an over-cap single shot whole", () => {
    expect(groupShotsForFanOut(shots(14))).toEqual([
      { shotIndexes: [0], seconds: 14 },
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

describe("describeGenerations", () => {
  it("returns nothing for an empty script", () => {
    expect(describeGenerations([])).toEqual([]);
  });

  // The default is the pre-existing rule: a group of more than one shot is multishot.
  it("defaults a multi-shot group to multishot and a lone shot to single", () => {
    const gens = describeGenerations(shots(3, 5, 6));
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0, 1], [2]]);
    expect(gens.map((g) => g.multishot)).toEqual([true, false]);
    expect(gens.map((g) => g.seconds)).toEqual([8, 6]);
    expect(gens.map((g) => g.index)).toEqual([0, 1]);
  });

  it("keys a generation by its shot indexes", () => {
    expect(describeGenerations(shots(3, 5, 6)).map((g) => g.key)).toEqual(["0-1", "2"]);
  });

  it("applies an override to exactly the generation it names", () => {
    const gens = describeGenerations(shots(3, 5, 6), { "0-1": false });
    expect(gens.map((g) => g.multishot)).toEqual([false, false]);
  });

  it("can turn a lone shot into a multishot generation", () => {
    expect(describeGenerations(shots(3, 5, 6), { "2": true })[1].multishot).toBe(true);
  });

  // A re-parse shifts group boundaries, so old keys match nothing. The override an operator
  // set for a group that no longer exists must not leak onto a differently-shaped one.
  it("ignores an override whose key matches no generation", () => {
    const gens = describeGenerations(shots(3, 5, 6), { "0-1-2": false, "7": true });
    expect(gens.map((g) => g.multishot)).toEqual([true, false]);
  });
});

describe("generationKey", () => {
  it("joins indexes with a dash, in order", () => {
    expect(generationKey([0, 1, 2])).toBe("0-1-2");
    expect(generationKey([4])).toBe("4");
  });
});

describe("pack window", () => {
  // Derived, not authored — asserted against the table rather than against today's 30/3, so a
  // vendor moving a limit cannot leave these agreeing by coincidence.
  it("takes its ceiling from the widest model window", () => {
    expect(PACK_CEILING_SECONDS).toBe(
      Math.max(...MULTISHOT_MODELS.map((m) => m.maxTotalSeconds)),
    );
  });

  it("takes its floor from the lowest model minimum", () => {
    expect(PACK_FLOOR_SECONDS).toBe(
      Math.min(...MULTISHOT_MODELS.map((m) => m.minTotalSeconds)),
    );
  });

  // A fact about rows already on disk, NOT a claim about a model — so it must not track the table.
  it("pins the legacy ceiling at 10 independently of the table", () => {
    expect(LEGACY_PACK_CEILING).toBe(10);
  });
});

describe("groupShotsForFanOut ceiling parameter", () => {
  it("defaults to the legacy 10s ceiling", () => {
    expect(shape(groupShotsForFanOut(shots(4, 5, 4)))).toEqual([
      { idx: [0, 1], s: 9 },
      { idx: [2], s: 4 },
    ]);
  });

  // THE POINT OF THE CHANGE. The CHUPPS fixture packs to three groups at 10s and one at 30s.
  it("packs a whole reel into one group at 30s", () => {
    expect(shape(groupShotsForFanOut(shots(3, 5, 6, 4, 2), 30))).toEqual([
      { idx: [0, 1, 2, 3, 4], s: 20 },
    ]);
  });

  it("still splits when the passed ceiling is exceeded", () => {
    expect(shape(groupShotsForFanOut(shots(20, 15), 30))).toEqual([
      { idx: [0], s: 20 },
      { idx: [1], s: 15 },
    ]);
  });

  // The rebalance must test overflow against the PASSED ceiling. Greedy gives [0,1]=29 / [2]=2;
  // the 2s tail is under the floor, so shot 1 moves forward — legal only because 11 <= 30.
  it("rebalances against the passed ceiling", () => {
    expect(shape(groupShotsForFanOut(shots(20, 9, 2), 30))).toEqual([
      { idx: [0], s: 20 },
      { idx: [1, 2], s: 11 },
    ]);
  });

  // Declines the move that would strand the group it steals from, exactly as at 10s.
  it("declines a stranding move at 30s and clamps the tail instead", () => {
    expect(shape(groupShotsForFanOut(shots(1, 28, 2), 30))).toEqual([
      { idx: [0, 1], s: 29 },
      { idx: [2], s: 3 },
    ]);
  });

  it("keeps a single shot longer than the ceiling whole", () => {
    expect(groupShotsForFanOut(shots(34), 30)).toEqual([
      { shotIndexes: [0], seconds: 34 },
    ]);
  });
});

describe("grouping version", () => {
  it("is 2 for new parses", () => {
    expect(CURRENT_GROUPING_VERSION).toBe(2);
  });

  it("maps v1 to the legacy ceiling and v2 to the derived one", () => {
    expect(ceilingForVersion(1)).toBe(LEGACY_PACK_CEILING);
    expect(ceilingForVersion(2)).toBe(PACK_CEILING_SECONDS);
  });

  // v1 keeps the rule existing canvases were defaulted under; v2 never turns multishot on.
  it("defaults multishot by version, not by shot count alone", () => {
    expect(defaultMultishotFor([0, 1], 1)).toBe(true);
    expect(defaultMultishotFor([0], 1)).toBe(false);
    expect(defaultMultishotFor([0, 1], 2)).toBe(false);
    expect(defaultMultishotFor([0], 2)).toBe(false);
  });
});

describe("describeGenerations by version", () => {
  // The migration, asserted: an absent version behaves exactly as today.
  it("defaults to v1 — today's packing and today's multishot rule", () => {
    const gens = describeGenerations(shots(3, 5, 6));
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0, 1], [2]]);
    expect(gens.map((g) => g.multishot)).toEqual([true, false]);
  });

  it("packs to 30s and defaults every generation to single under v2", () => {
    const gens = describeGenerations(shots(3, 5, 6, 4, 2), undefined, 2);
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0, 1, 2, 3, 4]]);
    expect(gens.map((g) => g.multishot)).toEqual([false]);
  });

  it("still honours an explicit override under v2", () => {
    const gens = describeGenerations(shots(3, 5, 6, 4, 2), { "0-1-2-3-4": true }, 2);
    expect(gens[0].multishot).toBe(true);
  });

  it("recommends multishot for a multi-shot group without enabling it", () => {
    const gens = describeGenerations(shots(3, 5, 6, 4, 2), undefined, 2);
    expect(gens[0].recommendMultishot).toBe(true);
    expect(gens[0].multishot).toBe(false);
  });

  it("does not recommend multishot for a lone shot", () => {
    expect(describeGenerations(shots(6), undefined, 2)[0].recommendMultishot).toBe(false);
  });

  // Reachable only via a single shot kept whole — packing can never build one by adding.
  it("flags a generation longer than the ceiling", () => {
    const gens = describeGenerations(shots(34), undefined, 2);
    expect(gens[0].overCeiling).toBe(true);
    expect(gens[0].seconds).toBe(34);
  });

  it("does not flag a generation at the ceiling", () => {
    expect(describeGenerations(shots(30), undefined, 2)[0].overCeiling).toBe(false);
  });
});
