import { describe, it, expect } from "vitest";
import { parsePlan, renderPlan, refsCitedIn, mergeRefinedPlan, checkPlanLimits } from "../multishot-plan";
import type { MultishotPlan } from "../multishot-plan";
import type { MultishotCut } from "../multishot-cuts";
import { multishotCapabilityFor } from "../multishot-models";
import { GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const OMNI = multishotCapabilityFor(GEMINI_OMNI_MODEL_ID);
const KLING = multishotCapabilityFor(KLING_OMNI_MODEL_ID);

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
    expect(renderPlan(plan, cuts, OMNI)).toBe(
      "Late afternoon, warm low sun.\n\n" +
        "[0-2s] Tight on a hand lifting keys.\n" +
        "[2-4s] A cab door swings open.\n" +
        "[4-8s] Feet hit the street.",
    );
  });

  // The property that keeps the request's duration honest: the ladder's last timestamp IS the
  // node's total, by construction rather than by check.
  it("ends the ladder exactly at the budget", () => {
    const last = renderPlan(plan, cuts, OMNI).trim().split("\n").at(-1)!;
    expect(last.startsWith("[4-8s]")).toBe(true);
  });

  it("takes seconds from the cuts, never from the plan", () => {
    const retimed = renderPlan(
      plan,
      [
        { id: "c1", text: "keys", seconds: 5 },
        { id: "c2", text: "cab", seconds: 2 },
        { id: "c3", text: "street", seconds: 1 },
      ],
      OMNI,
    );
    expect(retimed).toContain("[0-5s]");
    expect(retimed).toContain("[5-7s]");
    expect(retimed).toContain("[7-8s]");
  });
});

describe("refsCitedIn", () => {
  it("finds every token in order and deduplicates", () => {
    expect(refsCitedIn("the <IMAGE_REF_1> beside a <IMAGE_REF_0> and <IMAGE_REF_1>", OMNI)).toEqual([1, 0]);
  });

  it("ignores malformed tokens", () => {
    expect(refsCitedIn("<IMAGE_REF_> <IMAGE_REF> <IMAGE_REF_x> plain text", OMNI)).toEqual([]);
  });

  it("returns nothing for text with no references", () => {
    expect(refsCitedIn("a hand lifts keys", OMNI)).toEqual([]);
  });
});

const planCuts = [
  { id: "c1", text: "", seconds: 2 },
  { id: "c2", text: "", seconds: 3 },
];
const perModelPlan = {
  version: 1 as const,
  look: "Low sun from camera-left, warm grey concrete, 35mm at knee height.",
  beats: [
    { cutId: "c1", text: "A hand sweeps keys off oak." },
    { cutId: "c2", text: "A cab door swings open onto sunlit paving." },
  ],
};

describe("renderPlan per model", () => {
  it("emits Omni's cumulative timecode ladder", () => {
    expect(renderPlan(perModelPlan, planCuts, OMNI)).toBe(
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
        "[0-2s] A hand sweeps keys off oak.\n" +
        "[2-5s] A cab door swings open onto sunlit paving.",
    );
  });

  // D238 — the API's triple form, NOT the console's `Shot 1 (2s):`. Lowercase `shot`, comma
  // between number/seconds/text, semicolon between shots.
  //
  // The beat's own trailing period SURVIVES, giving ".;" at the seam. That is deliberate: a
  // parser splitting on `;` reads it correctly, and stripping it would be a cosmetic rewrite of
  // prose the operator authored. Only the semicolon strip below is structural enough to earn one.
  it("emits Kling's shot triples with the look as leading prose", () => {
    expect(renderPlan(perModelPlan, planCuts, KLING)).toBe(
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
        "shot 1, 2, A hand sweeps keys off oak.;\n" +
        "shot 2, 3, A cab door swings open onto sunlit paving.;",
    );
  });

  it("leaves a beat's own punctuation alone apart from semicolons", () => {
    const punctuated = {
      ...perModelPlan,
      beats: [{ cutId: "c1", text: "Wait — then, sharply: he turns!" }, perModelPlan.beats[1]],
    };
    expect(renderPlan(punctuated, planCuts, KLING)).toContain(
      "shot 1, 2, Wait — then, sharply: he turns!;",
    );
  });

  it("takes durations from the CUTS, so the triples sum to the request duration", () => {
    const rendered = renderPlan(perModelPlan, planCuts, KLING);
    const seconds = [...rendered.matchAll(/^shot \d+, (\d+),/gm)].map((m) => Number(m[1]));
    expect(seconds.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("renders every cut even when the plan is missing a beat for one", () => {
    const short = { ...perModelPlan, beats: [perModelPlan.beats[0]] };
    expect(renderPlan(short, planCuts, KLING)).toContain("shot 2, 3,");
  });

  // Beat text is prose an operator edits. A stray semicolon would split one shot into two on
  // Kling's parser, silently changing the cut count.
  it("strips semicolons from Kling beat text", () => {
    const risky = {
      ...perModelPlan,
      beats: [{ cutId: "c1", text: "keys land; the hand withdraws" }, perModelPlan.beats[1]],
    };
    const rendered = renderPlan(risky, planCuts, KLING);
    expect(rendered).toContain("shot 1, 2, keys land, the hand withdraws;");
    expect(rendered.match(/;/g)).toHaveLength(2); // one terminator per shot, no more
  });
});

describe("checkPlanLimits", () => {
  it("passes a plan inside the model's budgets", () => {
    expect(checkPlanLimits(perModelPlan, planCuts, KLING)).toEqual({ ok: true });
  });

  it("passes anything on a model that states no limits", () => {
    const huge = { ...perModelPlan, beats: [{ cutId: "c1", text: "x".repeat(9000) }, perModelPlan.beats[1]] };
    expect(checkPlanLimits(huge, planCuts, OMNI)).toEqual({ ok: true });
  });

  it("refuses a beat over 512 characters, naming the shot", () => {
    const long = { ...perModelPlan, beats: [{ cutId: "c1", text: "x".repeat(513) }, perModelPlan.beats[1]] };
    const res = checkPlanLimits(long, planCuts, KLING);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("Shot 1");
      expect(res.reason).toContain("512");
    }
  });

  it("refuses a whole prompt over 3072 characters", () => {
    const long = {
      ...perModelPlan,
      look: "y".repeat(3000),
      beats: [{ cutId: "c1", text: "x".repeat(400) }, { cutId: "c2", text: "x".repeat(400) }],
    };
    const res = checkPlanLimits(long, planCuts, KLING);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("3072");
  });

  // Measured on what is actually SENT, not on the raw beats: the rendered string carries the
  // look, the triples and their punctuation, and that is the string the 3072 cap applies to.
  it("measures the rendered prompt, not the sum of the beats", () => {
    const res = checkPlanLimits(
      { ...perModelPlan, look: "z".repeat(3060) },
      planCuts,
      KLING,
    );
    expect(res.ok).toBe(false);
  });
});

describe("refsCitedIn per model", () => {
  it("finds Omni's zero-based tokens and not Kling's", () => {
    expect(refsCitedIn("the <IMAGE_REF_1> and <IMAGE_REF_0>", OMNI)).toEqual([1, 0]);
    expect(refsCitedIn("the @image_1", OMNI)).toEqual([]);
  });

  // Returned ZERO-BASED for both, because the caller indexes promptRefImages with it.
  it("finds Kling's one-based tokens and returns zero-based indexes", () => {
    expect(refsCitedIn("the @image_1 and @image_2", KLING)).toEqual([0, 1]);
    expect(refsCitedIn("the <IMAGE_REF_0>", KLING)).toEqual([]);
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

  // Caught by mergeRefinedPlan's own pre-check (the `plan.beats.some(...)` guard), not by
  // parsePlan's cuts-membership check — the merged whole never reaches parsePlan for this case.
  it("rejects a cutId that is not in the plan", () => {
    const out = mergeRefinedPlan(plan, "cut", { text: "x" }, "nope", cuts);
    expect(out).toEqual({ ok: false, reason: "That shot is not in this plan." });
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
