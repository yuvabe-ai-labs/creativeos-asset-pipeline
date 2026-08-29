import { describe, it, expect } from "vitest";
import { splitMultishotData } from "../split-multishot";
import type { ShotNodeData } from "@/lib/canvas-nodes";

const grouped: ShotNodeData = {
  script: {
    title: "Reel",
    strategic_objective: "Brand awareness",
    visual_script: {
      shots: [
        { description: "one", duration_seconds: 3 },
        { description: "two", duration_seconds: 5 },
      ],
      execution_refinement: "keep it quick",
    },
  },
  order: 2,
  multishot: true,
  shot_type: "Close-Up",
  seededFrom: { scriptNodeId: "script-1", shotIndex: 3, shotIndexes: [3, 4], scriptTitle: "Reel" },
};

describe("splitMultishotData", () => {
  it("produces one single-shot node per shot, in order", () => {
    const out = splitMultishotData(grouped);
    expect(out).toHaveLength(2);
    expect(out.map((d) => d.script?.visual_script?.shots?.[0]?.description)).toEqual(["one", "two"]);
    expect(out.every((d) => d.script?.visual_script?.shots?.length === 1)).toBe(true);
  });

  it("clears multishot on every produced node", () => {
    expect(splitMultishotData(grouped).every((d) => d.multishot === false)).toBe(true);
  });

  // The rest of the reel — objective, execution notes — is what makes a Shot "a Script node with
  // one shot" (D21). Dropping it on split would quietly strip downstream prompts of their context.
  it("keeps the full script context on each piece", () => {
    for (const d of splitMultishotData(grouped)) {
      expect(d.script?.strategic_objective).toBe("Brand awareness");
      expect(d.script?.visual_script?.execution_refinement).toBe("keep it quick");
    }
  });

  it("carries each piece's own source index in the lineage", () => {
    const out = splitMultishotData(grouped);
    expect(out.map((d) => d.seededFrom?.shotIndex)).toEqual([3, 4]);
    expect(out.map((d) => d.seededFrom?.shotIndexes)).toEqual([[3], [4]]);
    expect(out.every((d) => d.seededFrom?.scriptNodeId === "script-1")).toBe(true);
  });

  // shot_type was derived from the group's FIRST shot, so it is only true of the first piece.
  it("re-derives shot_type per piece rather than copying the group's", () => {
    const out = splitMultishotData({
      ...grouped,
      script: {
        visual_script: {
          shots: [
            { description: "Wide shot of the street" },
            { description: "Extreme close-up on the label" },
          ],
        },
      },
    });
    expect(out.map((d) => d.shot_type)).toEqual(["Wide Shot", "Extreme Close-Up"]);
  });

  it("returns a single unchanged-shape node when there is nothing to split", () => {
    const single: ShotNodeData = {
      script: { visual_script: { shots: [{ description: "only" }] } },
      multishot: true,
    };
    const out = splitMultishotData(single);
    expect(out).toHaveLength(1);
    expect(out[0].multishot).toBe(false);
  });
});
