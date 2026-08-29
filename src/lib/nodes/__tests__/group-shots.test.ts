import { describe, it, expect } from "vitest";
import { groupShotsForFanOut, shotSeconds, describeShotGrouping } from "../group-shots";
import type { ReelShot } from "../reel-script";

const shots = (...lengths: number[]): ReelShot[] =>
  lengths.map((n, i) => ({ description: `shot ${i + 1}`, duration_seconds: n }));

const shape = (gs: ReturnType<typeof groupShotsForFanOut>) =>
  gs.map((g) => ({ idx: g.shotIndexes, s: g.seconds }));

/** Shots grouped into beats: `beat(4, 1,1,1,1)` is beat 4 with four 1s shots. */
const beats = (...spec: number[][]): ReelShot[] =>
  spec.flatMap(([beatIndex, ...lengths], b) =>
    lengths.map((n, i) => ({
      description: `beat ${beatIndex} shot ${i + 1}`,
      duration_seconds: n,
      beat_index: beatIndex,
      beat_label: `beat ${b}`,
    })),
  );

const counts = (gs: ReturnType<typeof groupShotsForFanOut>) =>
  gs.map((g) => ({ shots: g.shotIndexes.length, s: g.seconds }));

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

describe("groupShotsForFanOut — beats (D199)", () => {
  // THE FIXTURE. The CHUPPS 20s script as it really is: 5 timecoded beats holding 18 camera
  // setups. The reference decomposition in ref/multishot-refs/chupps-20s-gemini-omni-prompts.md
  // expects three generations — Hook+Lives, Product, Brand+Close — and this must reproduce them.
  const chupps = beats(
    [0, 1, 1, 1, 1],       // Hook: 4 shots, 4s
    [1, 1, 1, 1, 2],       // Different lives: 4 shots, 5s
    [2, 1, 1, 1, 1, 1, 1], // Product + style: 6 shots, 6s
    [3, 1, 1, 1, 1],       // Brand moment: 4 shots, 4s
    [4, 2],                // Close: 1 shot, 2s
  );

  it("packs whole beats and reproduces the reference's three generations", () => {
    // 19 camera setups where the shipped parse returned 5 entries.
    expect(chupps).toHaveLength(19);
    // The reference's Gen A / B / C carry 8, 6 and 5 shots. Greedy alone would give
    // beats 0+1, beats 2+3 (10s) and a stranded 2s close; the rebalance moves beat 3 forward.
    expect(counts(groupShotsForFanOut(chupps))).toEqual([
      { shots: 8, s: 9 }, // beats 0+1 — Hook + Different lives
      { shots: 6, s: 6 }, // beat 2    — Product + style
      { shots: 5, s: 6 }, // beats 3+4 — Brand moment + close
    ]);
  });

  // The point of beat-awareness. A seam is an un-guaranteed transition, so it belongs where the
  // script already wanted a cut — never inside a beat written as continuous.
  it("never splits a beat that fits under the cap", () => {
    const groups = groupShotsForFanOut(chupps);
    for (const beatIndex of [0, 1, 2, 3, 4]) {
      const owning = groups.filter((g) =>
        g.shotIndexes.some((i) => chupps[i].beat_index === beatIndex),
      );
      expect(owning).toHaveLength(1);
    }
  });

  it("conserves every shot exactly once, in order", () => {
    const flat = groupShotsForFanOut(chupps).flatMap((g) => g.shotIndexes);
    expect(flat).toEqual(chupps.map((_, i) => i));
  });

  // A beat too long for one generation has to be split — but only that beat.
  it("splits a beat that alone exceeds the cap, and only that one", () => {
    const long = beats([0, 4, 4, 4, 4], [1, 3]); // 16s beat, then a 3s beat
    expect(shape(groupShotsForFanOut(long))).toEqual([
      { idx: [0, 1], s: 8 },
      { idx: [2, 3], s: 8 },
      { idx: [4], s: 3 },
    ]);
  });

  // Scripts parsed before v3 carry no beat_index. They must group exactly as they did before.
  it("treats a shot with no beat_index as its own beat", () => {
    expect(shape(groupShotsForFanOut(shots(3, 5, 6, 4, 2)))).toEqual([
      { idx: [0, 1], s: 8 },
      { idx: [2], s: 6 },
      { idx: [3, 4], s: 6 },
    ]);
  });

  it("handles a mix of tagged and untagged shots without dropping any", () => {
    const mixed: ReelShot[] = [
      { duration_seconds: 2, beat_index: 0 },
      { duration_seconds: 2, beat_index: 0 },
      { duration_seconds: 3 },
      { duration_seconds: 4, beat_index: 1 },
    ];
    const flat = groupShotsForFanOut(mixed).flatMap((g) => g.shotIndexes);
    expect(flat).toEqual([0, 1, 2, 3]);
  });
});

describe("describeShotGrouping (D200)", () => {
  it("labels every shot with its generation and whether it shares one", () => {
    // Two 4s shots group; the 6s one cannot join them.
    expect(describeShotGrouping(shots(4, 4, 6)).map((l) => l.label)).toEqual([
      "Multishot · Gen 1",
      "Multishot · Gen 1",
      "Single · Gen 2",
    ]);
  });

  it("marks a lone shot as Single", () => {
    expect(describeShotGrouping(shots(9))).toEqual([
      { groupIndex: 0, multishot: false, label: "Single · Gen 1" },
    ]);
  });

  it("returns nothing for an empty script", () => {
    expect(describeShotGrouping([])).toEqual([]);
  });

  // The label must agree with fan-out exactly — it exists to show the plan before committing.
  it("agrees with groupShotsForFanOut on every shot", () => {
    const source = shots(3, 5, 6, 4, 2);
    const labels = describeShotGrouping(source);
    groupShotsForFanOut(source).forEach((group, groupIndex) => {
      for (const shotIndex of group.shotIndexes) {
        expect(labels[shotIndex].groupIndex).toBe(groupIndex);
        expect(labels[shotIndex].multishot).toBe(group.shotIndexes.length > 1);
      }
    });
  });
});
