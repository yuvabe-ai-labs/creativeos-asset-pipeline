import { describe, it, expect } from "vitest";
import { parsePlan, renderPlan, refsCitedIn, mergeRefinedPlan } from "../multishot-plan";
import type { MultishotPlan } from "../multishot-plan";
import type { MultishotCut } from "../multishot-cuts";

const cuts: MultishotCut[] = [
  { id: "c1", text: "keys", seconds: 2 },
  { id: "c2", text: "cab", seconds: 2 },
  { id: "c3", text: "street", seconds: 4 },
];

const raw = (over: Record<string, unknown> = {}) => ({
  version: 1,
  look: "Late afternoon, warm low sun.",
  beats: [
    { cutId: "c1", text: "Tight on a hand lifting keys." },
    { cutId: "c2", text: "A cab door swings open." },
    { cutId: "c3", text: "Feet hit the street." },
  ],
  ...over,
});

describe("parsePlan", () => {
  it("accepts a complete plan", () => {
    const result = parsePlan(raw(), cuts);
    expect(result.ok).toBe(true);
  });

  // Rejected WHOLE, never partially applied — a half-applied plan leaves the node in a state
  // neither the model nor the operator authored.
  it("rejects a beat naming a cut that is not on this node", () => {
    const result = parsePlan(raw({ beats: [{ cutId: "nope", text: "x" }] }), cuts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/isn't in this node/i);
  });

  it("rejects a plan missing a cut — a ladder with a hole bills full price for a gap", () => {
    const result = parsePlan(
      raw({ beats: [{ cutId: "c1", text: "a" }, { cutId: "c2", text: "b" }] }),
      cuts,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/every shot/i);
  });

  // The look is what makes separate cuts read as one film. Without it they are unrelated clips.
  it("rejects a missing or empty look", () => {
    expect(parsePlan(raw({ look: "" }), cuts).ok).toBe(false);
    expect(parsePlan(raw({ look: "   " }), cuts).ok).toBe(false);
    expect(parsePlan(raw({ look: undefined }), cuts).ok).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(parsePlan(null, cuts).ok).toBe(false);
    expect(parsePlan("a prompt", cuts).ok).toBe(false);
  });

  // Not an error. Cut order is the edit; beat order in the JSON is an artifact of generation.
  it("reorders beats to cut order", () => {
    const result = parsePlan(
      raw({
        beats: [
          { cutId: "c3", text: "third" },
          { cutId: "c1", text: "first" },
          { cutId: "c2", text: "second" },
        ],
      }),
      cuts,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.beats.map((b) => b.text)).toEqual(["first", "second", "third"]);
  });

  // Duplicate cutId collapses in the map, so a plan with the same length as cuts can still
  // miss one. This is the case the length-based intuition would miss — coverage, not count.
  it("rejects a plan with duplicate cutId that leaves a cut uncovered", () => {
    const result = parsePlan(
      raw({
        beats: [
          { cutId: "c1", text: "first" },
          { cutId: "c1", text: "duplicate" },
          { cutId: "c2", text: "second" },
        ],
      }),
      cuts,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/every shot/i);
  });

  it("rejects a non-string look", () => {
    expect(parsePlan(raw({ look: 42 }), cuts).ok).toBe(false);
    expect(parsePlan(raw({ look: null }), cuts).ok).toBe(false);
    expect(parsePlan(raw({ look: {} }), cuts).ok).toBe(false);
  });

  it("rejects a beat that is not an object with cutId and text", () => {
    expect(parsePlan(raw({ beats: [null, { cutId: "c1", text: "a" }] }), cuts).ok).toBe(false);
    expect(parsePlan(raw({ beats: [{ cutId: "c1", text: "a" }, 42] }), cuts).ok).toBe(false);
    expect(parsePlan(raw({ beats: ["string", { cutId: "c1", text: "a" }] }), cuts).ok).toBe(false);
  });
});

describe("renderPlan", () => {
  const plan: MultishotPlan = {
    version: 1,
    look: "Late afternoon, warm low sun.",
    beats: [
      { cutId: "c1", text: "Tight on a hand lifting keys." },
      { cutId: "c2", text: "A cab door swings open." },
      { cutId: "c3", text: "Feet hit the street." },
    ],
  };

  it("puts the look above the ladder, separated", () => {
    expect(renderPlan(plan, cuts)).toBe(
      "Late afternoon, warm low sun.\n\n" +
        "[0-2s] Tight on a hand lifting keys.\n" +
        "[2-4s] A cab door swings open.\n" +
        "[4-8s] Feet hit the street.",
    );
  });

  // The property that keeps the request's duration honest: the ladder's last timestamp IS the
  // node's total, by construction rather than by check.
  it("ends the ladder exactly at the budget", () => {
    const last = renderPlan(plan, cuts).trim().split("\n").at(-1)!;
    expect(last.startsWith("[4-8s]")).toBe(true);
  });

  it("takes seconds from the cuts, never from the plan", () => {
    const retimed = renderPlan(plan, [
      { id: "c1", text: "keys", seconds: 5 },
      { id: "c2", text: "cab", seconds: 2 },
      { id: "c3", text: "street", seconds: 1 },
    ]);
    expect(retimed).toContain("[0-5s]");
    expect(retimed).toContain("[5-7s]");
    expect(retimed).toContain("[7-8s]");
  });
});

describe("refsCitedIn", () => {
  it("finds every token in order and deduplicates", () => {
    expect(refsCitedIn("the <IMAGE_REF_1> beside a <IMAGE_REF_0> and <IMAGE_REF_1>")).toEqual([1, 0]);
  });

  it("ignores malformed tokens", () => {
    expect(refsCitedIn("<IMAGE_REF_> <IMAGE_REF> <IMAGE_REF_x> plain text")).toEqual([]);
  });

  it("returns nothing for text with no references", () => {
    expect(refsCitedIn("a hand lifts keys")).toEqual([]);
  });
});

describe("mergeRefinedPlan", () => {
  const plan: MultishotPlan = {
    version: 1,
    look: "Late afternoon, warm low sun.",
    beats: [
      { cutId: "c1", text: "Tight on a hand lifting keys." },
      { cutId: "c2", text: "A cab door swings open." },
      { cutId: "c3", text: "Feet hit the street." },
    ],
  };

  it("replaces only the look", () => {
    const out = mergeRefinedPlan(plan, "look", { look: "Overcast, flat and soft." }, undefined, cuts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.look).toBe("Overcast, flat and soft.");
    expect(out.plan.beats).toEqual(plan.beats);
  });

  // The whole point of the narrow schema: a beat the operator hand-edited cannot be touched by a
  // rewrite of a different beat, because the model was never asked for it.
  it("replaces only the named beat and leaves the others identical", () => {
    const out = mergeRefinedPlan(plan, "cut", { text: "A palm sweeps keys off oak." }, "c2", cuts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.beats[1].text).toBe("A palm sweeps keys off oak.");
    expect(out.plan.beats[0].text).toBe(plan.beats[0].text);
    expect(out.plan.beats[2].text).toBe(plan.beats[2].text);
    expect(out.plan.look).toBe(plan.look);
  });

  it("rejects a cut merge with no cutId", () => {
    const out = mergeRefinedPlan(plan, "cut", { text: "x" }, undefined, cuts);
    expect(out).toEqual({ ok: false, reason: "No shot was named for this rewrite." });
  });

  it("rejects a cutId that is not in the cuts", () => {
    const out = mergeRefinedPlan(plan, "cut", { text: "x" }, "nope", cuts);
    expect(out.ok).toBe(false);
  });

  it("rejects an empty fragment", () => {
    expect(mergeRefinedPlan(plan, "look", { look: "   " }, undefined, cuts).ok).toBe(false);
    expect(mergeRefinedPlan(plan, "cut", { text: "  " }, "c1", cuts).ok).toBe(false);
  });

  // The merged whole goes through parsePlan, so a plan whose cut list changed underneath the
  // operator fails here rather than being written with a beat missing.
  it("rejects when the cuts no longer match the plan", () => {
    const fewer: MultishotCut[] = [{ id: "c1", text: "keys", seconds: 2 }];
    expect(mergeRefinedPlan(plan, "look", { look: "New look." }, undefined, fewer).ok).toBe(false);
  });
});
