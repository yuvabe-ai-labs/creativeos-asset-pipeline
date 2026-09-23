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
  mergeShotRows,
  scenesAsGenerations,
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
  it("is 3 for new parses", () => {
    expect(CURRENT_GROUPING_VERSION).toBe(3);
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

// BUG-004 — a single-take generation (Multishot off) is ONE shot: one description, one length.
// Fan-out used to keep every script row on the node, and every reader (the card, the Composer
// seed, node-output) took row 1 — a 20s take read as its first 3 seconds.
describe("mergeShotRows", () => {
  it("keeps a lone row exactly as it is", () => {
    const row = { description: "a", duration: "0-3 sec", duration_seconds: 3, clip: 1 };
    expect(mergeShotRows([row])).toEqual(row);
  });

  it("joins several rows into one take, summing their length", () => {
    expect(
      mergeShotRows([
        { description: "close on keys.", duration: "0-2 sec", duration_seconds: 2, clip: 1 },
        { description: "a cab door swings", duration: "2-5 sec", duration_seconds: 3, clip: 1 },
        { description: "  ", duration_seconds: 4 },
        { description: "feet hit the street", duration: "9-10 sec", duration_seconds: 1 },
      ]),
    ).toEqual({
      description: "close on keys. A cab door swings Feet hit the street",
      duration: "10s",
      duration_seconds: 10,
      clip: 1,
    });
  });

  it("counts an unlengthed row as the assumed length", () => {
    expect(mergeShotRows([{ description: "a" }, { description: "b" }]).duration_seconds).toBe(8);
  });

  // D267 — merging rows into one Shot take must not silently drop the VO lines mapped onto them.
  it("concatenates the merged rows' voiceover lines, in order", () => {
    const vo1 = [{ text: "Close on keys.", speaker: "narrator" }];
    const vo2 = [{ text: "A cab door swings.", speaker: "narrator" }];
    const merged = mergeShotRows([
      { description: "a", duration_seconds: 2, voiceover: vo1 },
      { description: "b", duration_seconds: 3, voiceover: vo2 },
    ]);
    expect(merged.voiceover).toEqual([...vo1, ...vo2]);
  });

  it("skips a row with no voiceover key when concatenating", () => {
    const vo1 = [{ text: "Close on keys.", speaker: "narrator" }];
    const merged = mergeShotRows([
      { description: "a", duration_seconds: 2, voiceover: vo1 },
      { description: "b", duration_seconds: 3 },
    ]);
    expect(merged.voiceover).toEqual(vo1);
  });

  it("omits the voiceover key entirely when none of the merged rows have one", () => {
    const merged = mergeShotRows([
      { description: "a", duration_seconds: 2 },
      { description: "b", duration_seconds: 3 },
    ]);
    expect("voiceover" in merged).toBe(false);
  });
});

// BUG-008 — a script's own CLIP headings are a hard boundary. Packing to the 30s ceiling made every
// ≤30s script one clip (Seedance); with clips marked, the 20s Chupster reel below becomes two 10s
// clips, which Omni can take.
describe("groupShotsForFanOut honours clip boundaries", () => {
  const clipped = (...spec: [number, number][]): ReelShot[] =>
    spec.map(([seconds, clip], i) => ({ description: `shot ${i + 1}`, duration_seconds: seconds, clip }));

  it("never merges shots from different clips, even when they would fit the ceiling", () => {
    expect(shape(groupShotsForFanOut(clipped([3, 1], [3, 1], [4, 1], [3, 2], [3, 2], [4, 2]), 30))).toEqual([
      { idx: [0, 1, 2], s: 10 },
      { idx: [3, 4, 5], s: 10 },
    ]);
  });

  it("still packs to the ceiling inside one clip", () => {
    expect(shape(groupShotsForFanOut(clipped([20, 1], [15, 1]), 30))).toEqual([
      { idx: [0], s: 20 },
      { idx: [1], s: 15 },
    ]);
  });

  // The trailing rebalance moves a shot backward into a short tail; it must not pull one across
  // a clip boundary the script drew.
  it("does not rebalance across a clip boundary", () => {
    expect(shape(groupShotsForFanOut(clipped([4, 1], [4, 1], [2, 2]), 30))).toEqual([
      { idx: [0, 1], s: 8 },
      { idx: [2], s: 3 }, // clamped to the floor, not fed a shot from clip 1
    ]);
  });

  it("treats 0 / absent as unmarked, packing exactly as before", () => {
    const unmarked = shots(3, 5, 6, 4, 2).map((s) => ({ ...s, clip: 0 }));
    expect(shape(groupShotsForFanOut(unmarked, 30))).toEqual([{ idx: [0, 1, 2, 3, 4], s: 20 }]);
  });

  it("flows through describeGenerations", () => {
    const gens = describeGenerations(clipped([5, 1], [5, 1], [5, 2], [5, 2]), undefined, 2);
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0, 1], [2, 3]]);
  });
});

// D277 — the operator's script is the authority on what a generation is: "no need to do seedance
// specific parsing when more than 15s like that, just parse. If they want to do 30s continuous
// take it will be in script, they will mention it."
describe("grouping v3 — one generation per scene", () => {
  it("gives every scene its own generation, in order", () => {
    expect(shape(scenesAsGenerations(shots(5, 5, 8, 7, 6, 4)))).toEqual([
      { idx: [0], s: 5 },
      { idx: [1], s: 5 },
      { idx: [2], s: 8 },
      { idx: [3], s: 7 },
      { idx: [4], s: 6 },
      { idx: [5], s: 4 },
    ]);
  });

  // No floor clamp either: a 2s scene is a 2s scene. Clamping invents video the script did not
  // ask for, which is the same fault as packing, one number down.
  it("never packs, never rebalances and never clamps", () => {
    expect(shape(scenesAsGenerations(shots(2)))).toEqual([{ idx: [0], s: 2 }]);
    expect(shape(scenesAsGenerations(shots(35)))).toEqual([{ idx: [0], s: 35 }]);
  });

  it("is what describeGenerations uses at the current version", () => {
    const gens = describeGenerations(shots(5, 5, 8), {}, CURRENT_GROUPING_VERSION);
    expect(gens.map((g) => g.shotIndexes)).toEqual([[0], [1], [2]]);
    expect(gens.every((g) => g.multishot === false)).toBe(true);
    // One scene per generation: there is no multi-shot group left to recommend multishot for.
    expect(gens.every((g) => g.recommendMultishot === false)).toBe(true);
  });

  it("still says when a single scene is longer than any model can take", () => {
    const [gen] = describeGenerations(shots(35), {}, 3);
    expect(gen.overCeiling).toBe(true);
  });

  // The whole point of a version: a canvas parsed before this change keeps the generations it
  // already has, and nothing on screen moves under its operator.
  it("leaves v1 and v2 packing exactly as it was", () => {
    expect(shape(groupShotsForFanOut(shots(4, 5, 4), ceilingForVersion(1)))).toEqual(
      shape(groupShotsForFanOut(shots(4, 5, 4), LEGACY_PACK_CEILING)),
    );
    expect(describeGenerations(shots(5, 5, 8), {}, 1).map((g) => g.shotIndexes)).toEqual([
      [0, 1],
      [2],
    ]);
    expect(describeGenerations(shots(5, 5, 8), {}, 2).map((g) => g.shotIndexes)).toEqual([
      [0, 1, 2],
    ]);
  });
});
