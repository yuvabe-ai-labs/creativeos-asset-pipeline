import { describe, it, expect } from "vitest";
import { canMergeShots, mergeShotData, sortForMerge, totalSeconds } from "../merge-shots";
import { splitMultishotData } from "../split-multishot";
import type { ShotNodeData } from "@/lib/canvas-nodes";

function shotNode(
  indexes: number[],
  descriptions: string[],
  opts: { scriptNodeId?: string; seconds?: number; order?: number } = {},
): { type: string; data: ShotNodeData } {
  return {
    type: "shot",
    data: {
      order: opts.order,
      multishot: descriptions.length > 1,
      script: {
        strategic_objective: "Sell the shoe",
        visual_script: {
          shots: descriptions.map((description) => ({
            description,
            ...(opts.seconds ? { duration_seconds: opts.seconds } : {}),
          })),
        },
      },
      seededFrom: {
        scriptNodeId: opts.scriptNodeId ?? "script-1",
        shotIndex: indexes[0],
        shotIndexes: indexes,
      },
    } as ShotNodeData,
  };
}

describe("canMergeShots", () => {
  it("allows two shots from the same script", () => {
    expect(canMergeShots([shotNode([0], ["a"]), shotNode([1], ["b"])]).ok).toBe(true);
  });

  it("refuses a single node", () => {
    const v = canMergeShots([shotNode([0], ["a"])]);
    expect(v.ok).toBe(false);
  });

  it("refuses a selection containing a non-shot", () => {
    const v = canMergeShots([shotNode([0], ["a"]), { type: "prompt", data: {} as ShotNodeData }]);
    expect(v).toEqual({ ok: false, reason: "Only Shot nodes can be merged." });
  });

  // The merged node can only keep ONE script's objective, on-screen text and voiceover. Merging
  // across scripts would silently drop the other's.
  it("refuses shots from different scripts", () => {
    const v = canMergeShots([
      shotNode([0], ["a"], { scriptNodeId: "script-1" }),
      shotNode([0], ["b"], { scriptNodeId: "script-2" }),
    ]);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toMatch(/different scripts/);
  });

  // Over the cap the request's duration is shorter than the ladder, and the clip comes back
  // truncated at full price.
  it("refuses a selection over the 10s multishot cap", () => {
    const v = canMergeShots([
      shotNode([0], ["a"], { seconds: 6 }),
      shotNode([1], ["b"], { seconds: 6 }),
    ]);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toMatch(/10s multishot cap/);
  });

  it("allows a selection exactly at the cap", () => {
    expect(
      canMergeShots([shotNode([0], ["a"], { seconds: 5 }), shotNode([1], ["b"], { seconds: 5 })]).ok,
    ).toBe(true);
  });
});

describe("sortForMerge", () => {
  // Selection order is an artifact of how the box was dragged. The ladder's timings are
  // cumulative, so using it would silently reorder the film.
  it("orders by script position, not selection order", () => {
    const sorted = sortForMerge([shotNode([2], ["third"]), shotNode([0], ["first"]), shotNode([1], ["second"])]);
    expect(sorted.map((n) => n.data.script?.visual_script?.shots?.[0]?.description)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("falls back to `order` for a node with no recorded indexes", () => {
    const a = { type: "shot", data: { order: 2 } as ShotNodeData };
    const b = { type: "shot", data: { order: 1 } as ShotNodeData };
    expect(sortForMerge([a, b])[0]).toBe(b);
  });
});

describe("mergeShotData", () => {
  it("concatenates every beat in the given order", () => {
    const merged = mergeShotData([
      shotNode([0], ["first"]).data,
      shotNode([1], ["second", "third"]).data,
    ]);
    expect(merged.script?.visual_script?.shots?.map((s) => s.description)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("marks the result multishot and records every source index", () => {
    const merged = mergeShotData([shotNode([0], ["a"]).data, shotNode([1, 2], ["b", "c"]).data]);
    expect(merged.multishot).toBe(true);
    expect(merged.seededFrom?.shotIndexes).toEqual([0, 1, 2]);
    expect(merged.seededFrom?.shotIndex).toBe(0);
  });

  it("keeps the script envelope", () => {
    expect(mergeShotData([shotNode([0], ["a"]).data, shotNode([1], ["b"]).data]).script
      ?.strategic_objective).toBe("Sell the shoe");
  });

  it("takes the earliest order, and leaves it absent when no node had one", () => {
    expect(mergeShotData([shotNode([0], ["a"], { order: 5 }).data, shotNode([1], ["b"], { order: 2 }).data]).order)
      .toBe(2);
    // A sentinel here would sort the merged node to the very end of the reel.
    expect(mergeShotData([shotNode([0], ["a"]).data, shotNode([1], ["b"]).data]).order).toBeUndefined();
  });

  // The merge and the split are inverses; a round trip that loses beats or reorders them is the
  // failure that matters, since the operator can toggle between the two freely.
  it("round-trips with splitMultishotData", () => {
    const pieces = splitMultishotData(shotNode([0, 1, 2], ["a", "b", "c"]).data);
    const merged = mergeShotData(sortForMerge(pieces.map((data) => ({ data }))).map((n) => n.data));
    expect(merged.script?.visual_script?.shots?.map((s) => s.description)).toEqual(["a", "b", "c"]);
    expect(merged.seededFrom?.shotIndexes).toEqual([0, 1, 2]);
    expect(merged.multishot).toBe(true);
  });
});

describe("totalSeconds", () => {
  it("sums each beat's own length", () => {
    expect(totalSeconds([shotNode([0], ["a"], { seconds: 3 }).data, shotNode([1], ["b"], { seconds: 4 }).data]))
      .toBe(7);
  });
});
