import { describe, it, expect } from "vitest";
import {
  compositeContextOf,
  compositeContextLines,
  contextIds,
  resolveContextMentions,
} from "../context";

// D320 — a Script, Shot or Multishot wired into a composite is context for the picture.

const SCRIPT = {
  title: "Launch reel",
  visual_script: {
    shots: [
      { description: "Riya opens the box at her desk.", duration_seconds: 3 },
      { description: "Close-up of the sandals on the floor.", duration_seconds: 2 },
    ],
    execution_refinement: "Warm morning window light.",
  },
};

describe("compositeContextOf", () => {
  it("reads a script's shots from its active output, numbered from 1", () => {
    const c = compositeContextOf("s", "script", {}, SCRIPT)!;
    expect(c.title).toBe("Launch reel");
    expect(c.shots.map((s) => [s.id, s.label, s.text])).toEqual([
      ["s:shot:1", "Shot 1", "Riya opens the box at her desk."],
      ["s:shot:2", "Shot 2", "Close-up of the sandals on the floor."],
    ]);
    expect(c.notes).toBe("Warm morning window light.");
  });

  it("numbers a Shot node's shots as the script does (seededFrom is 0-based)", () => {
    const narrowed = { ...SCRIPT, visual_script: { shots: [SCRIPT.visual_script.shots[1]] } };
    const c = compositeContextOf("sh", "shot", { script: narrowed, seededFrom: { shotIndexes: [1] } }, null)!;
    expect(c.shots.map((s) => [s.id, s.label])).toEqual([["sh:shot:2", "Shot 2"]]);
  });

  it("reads a multishot's cuts under their own ids", () => {
    const c = compositeContextOf("m", "multishot", { cuts: [{ id: "c9", text: "Pour.", seconds: 2 }] }, null)!;
    expect(c.shots).toEqual([{ id: "m:shot:c9", label: "Shot 1", text: "Pour.", seconds: 2 }]);
  });

  it("is null for an image node", () => {
    expect(compositeContextOf("f", "file", {}, null)).toBeNull();
  });
});

describe("compositeContextLines / resolveContextMentions", () => {
  const ctx = [compositeContextOf("s", "script", {}, SCRIPT)!];

  it("sends only the mentioned shot when one is mentioned", () => {
    const [block] = compositeContextLines(ctx, "Riya for @[Shot: Launch reel · Shot 2](s:shot:2)");
    expect(block).toContain("Shot 2 (2s): Close-up of the sandals");
    expect(block).not.toContain("opens the box");
    expect(block).toContain("Production notes: Warm morning window light.");
  });

  it("sends every shot when the node is wired but not mentioned, or mentioned whole", () => {
    for (const instruction of ["Riya at her desk.", "Riya for @[Script: Launch reel](s)"]) {
      const [block] = compositeContextLines(ctx, instruction);
      expect(block).toContain("Shot 1");
      expect(block).toContain("Shot 2");
    }
  });

  it("is empty with nothing wired", () => {
    expect(compositeContextLines([], "anything")).toEqual([]);
  });

  it("turns a context chip into words, leaving image chips for the roster", () => {
    expect(
      resolveContextMentions("@[File: Sandals.png](f) for @[Shot: Launch reel · Shot 2](s:shot:2)", ctx),
    ).toBe("@[File: Sandals.png](f) for Shot 2 of Launch reel (see the shot context)");
  });

  it("knows every id a context chip may point at", () => {
    expect([...contextIds(ctx)]).toEqual(["s", "s:shot:1", "s:shot:2"]);
  });
});
