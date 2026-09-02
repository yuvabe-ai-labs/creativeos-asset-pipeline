import { describe, it, expect } from "vitest";
import { shotDataToMultishot, multishotDataToShot } from "../multishot-convert";
import type { ShotNodeData, MultishotNodeData } from "@/lib/canvas-nodes";

const shotData: ShotNodeData = {
  order: 2,
  shot_type: "Wide Shot",
  script: {
    strategic_objective: "sell the shoe",
    voiceover: "where are you headed?",
    visual_script: {
      execution_refinement: "keep it punchy",
      shots: [
        { description: "close on keys", duration_seconds: 2 },
        { description: "wide street", duration_seconds: 6 },
      ],
    },
  },
  // `shotIndex` (the pre-D193 legacy field) is required by ShotNodeData's type; every writer of
  // seededFrom in this codebase sets it to the first index. Kept here purely so this fixture
  // type-checks — the conversion functions pass seededFrom through unexamined either way.
  seededFrom: { scriptNodeId: "sc", shotIndex: 0, shotIndexes: [0, 1], scriptTitle: "CHUPPS" },
};

describe("shotDataToMultishot", () => {
  it("turns the rows into cuts and sets the budget to their sum", () => {
    const result = shotDataToMultishot(shotData);
    expect(result.cuts?.map((c) => [c.text, c.seconds])).toEqual([
      ["close on keys", 2],
      ["wide street", 6],
    ]);
    expect(result.totalSeconds).toBe(8);
  });

  // `cuts` is the sole shot list on a multishot node. A second copy inside the envelope would
  // drift the moment the operator edited one of them.
  it("strips the shot list from the envelope but keeps everything else", () => {
    const result = shotDataToMultishot(shotData);
    expect(result.script?.visual_script?.shots).toBeUndefined();
    expect(result.script?.visual_script?.execution_refinement).toBe("keep it punchy");
    expect(result.script?.strategic_objective).toBe("sell the shoe");
    expect(result.script?.voiceover).toBe("where are you headed?");
  });

  it("drops shot_type — framing is per cut on a multishot node", () => {
    expect("shot_type" in shotDataToMultishot(shotData)).toBe(false);
  });

  it("keeps lineage and order", () => {
    const result = shotDataToMultishot(shotData);
    expect(result.seededFrom).toEqual(shotData.seededFrom);
    expect(result.order).toBe(2);
  });

  // Omni will not accept a request outside its window, so the budget is clamped on the way in.
  it("clamps the budget into the Omni window", () => {
    const long = shotDataToMultishot({
      script: { visual_script: { shots: [{ description: "x", duration_seconds: 30 }] } },
    });
    expect(long.totalSeconds).toBe(10);
    const short = shotDataToMultishot({
      script: { visual_script: { shots: [{ description: "x", duration_seconds: 1 }] } },
    });
    expect(short.totalSeconds).toBe(3);
  });
});

describe("multishotDataToShot", () => {
  it("restores the shot list from the cuts", () => {
    const ms: MultishotNodeData = {
      order: 2,
      totalSeconds: 8,
      cuts: [
        { id: "c1", text: "close on keys", seconds: 2 },
        { id: "c2", text: "wide street", seconds: 6 },
      ],
      script: { strategic_objective: "sell the shoe", visual_script: { execution_refinement: "punchy" } },
      seededFrom: { scriptNodeId: "sc", shotIndexes: [0, 1], scriptTitle: "CHUPPS" },
    };
    const result = multishotDataToShot(ms);
    expect(result.script?.visual_script?.shots).toEqual([
      { description: "close on keys", duration_seconds: 2 },
      { description: "wide street", duration_seconds: 6 },
    ]);
    expect(result.script?.visual_script?.execution_refinement).toBe("punchy");
  });

  it("re-derives shot_type from the first cut", () => {
    const result = multishotDataToShot({
      cuts: [{ id: "c1", text: "an aerial drone pass", seconds: 4 }],
    });
    expect(result.shot_type).toBe("Aerial");
  });

  it("drops the budget", () => {
    const result = multishotDataToShot({ totalSeconds: 8, cuts: [{ id: "c", text: "x", seconds: 8 }] });
    expect("totalSeconds" in result).toBe(false);
    expect("cuts" in result).toBe(false);
  });
});

describe("the conversion round-trips", () => {
  // This is what makes the script-level switch a real undo: an accidental flip and flip-back
  // costs the operator nothing.
  it("returns the original text and seconds through both directions", () => {
    const back = multishotDataToShot(shotDataToMultishot(shotData));
    expect(back.script?.visual_script?.shots).toEqual([
      { description: "close on keys", duration_seconds: 2 },
      { description: "wide street", duration_seconds: 6 },
    ]);
    expect(back.script?.strategic_objective).toBe("sell the shoe");
    expect(back.seededFrom).toEqual(shotData.seededFrom);
  });
});
