import { describe, it, expect } from "vitest";
import {
  parsePlan,
  renderPlan,
  mergeRefinedPlan,
  checkPlanLimits,
  planIsDirty,
  setBeatText,
  storePlanRefs,
  renderPlanRefs,
  planMissingRefs,
  planCitedRefIds,
} from "../multishot-plan";
import type { MultishotPlan } from "../multishot-plan";
import type { MultishotCut } from "../multishot-cuts";
import type { VoLine } from "../reel-script";
import { multishotCapabilityFor } from "../multishot-models";
import { GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID, SEEDANCE_MODEL_ID } from "@/lib/video-gen/client-models";

const OMNI = multishotCapabilityFor(GEMINI_OMNI_MODEL_ID);
const KLING = multishotCapabilityFor(KLING_OMNI_MODEL_ID);
const SEEDANCE = multishotCapabilityFor(SEEDANCE_MODEL_ID);

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

  // D262 — an empty look is the CORRECT answer when the script states no look direction. The writer
  // is told to leave it blank rather than invent one, so rejecting blank would force it to invent.
  it("accepts an empty look as 'the script states none'", () => {
    for (const look of ["", "   ", undefined]) {
      const result = parsePlan(raw({ look }), cuts);
      expect(result.ok, `look ${JSON.stringify(look)}`).toBe(true);
      if (result.ok) expect(result.plan.look).toBe("");
    }
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

  describe("renderPlan — Seedance bare timecodes", () => {
    it("emits `0-2s:` lines with the look as leading prose", () => {
      expect(renderPlan(perModelPlan, planCuts, SEEDANCE)).toBe(
        "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
          "0-2s: A hand sweeps keys off oak.\n" +
          "2-5s: A cab door swings open onto sunlit paving.",
      );
    });

    // Cumulative, like Omni's — and from the CUTS, so the last timestamp IS the request duration.
    it("ends the ladder exactly at the budget", () => {
      const last = renderPlan(perModelPlan, planCuts, SEEDANCE).trim().split("\n").at(-1)!;
      expect(last.startsWith("2-5s:")).toBe(true);
    });

    // Seedance's own handles must survive untouched — unlike Kling, there is no semicolon rewrite
    // here, because nothing in this format is semicolon-delimited.
    it("leaves @Image handles and punctuation alone", () => {
      const withRef = {
        ...perModelPlan,
        beats: [{ cutId: "c1", text: "the @Image 1 rests on oak; light shifts" }, perModelPlan.beats[1]],
      };
      expect(renderPlan(withRef, planCuts, SEEDANCE)).toContain(
        "0-2s: the @Image 1 rests on oak; light shifts",
      );
    });
  });
});

// D267 (Task 3) — the cut's own VO lines, rendered and appended to its beat, in all three formats.
// The voiceover comes from the CUT, never from the plan's beats: an edited line applies without
// regenerating the plan.
describe("renderPlan — voiceover appended to the cut's own beat", () => {
  const vo: VoLine[] = [{ text: "Try it today.", speaker: "narrator" }];
  const cutsWithVo: MultishotCut[] = [
    { id: "c1", text: "", seconds: 2, voiceover: vo },
    { id: "c2", text: "", seconds: 3 },
  ];

  it("appends after Omni's beat, before the next line", () => {
    expect(renderPlan(perModelPlan, cutsWithVo, OMNI)).toBe(
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
        '[0-2s] A hand sweeps keys off oak. Voiceover: "Try it today."\n' +
        "[2-5s] A cab door swings open onto sunlit paving.",
    );
  });

  it("appends inside Kling's triple, before the terminating semicolon", () => {
    expect(renderPlan(perModelPlan, cutsWithVo, KLING)).toBe(
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
        'shot 1, 2, A hand sweeps keys off oak. Voiceover: "Try it today.";\n' +
        "shot 2, 3, A cab door swings open onto sunlit paving.;",
    );
  });

  it("appends after Seedance's bare-timecode beat", () => {
    expect(renderPlan(perModelPlan, cutsWithVo, SEEDANCE)).toBe(
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
        '0-2s: A hand sweeps keys off oak. Voiceover: "Try it today."\n' +
        "2-5s: A cab door swings open onto sunlit paving.",
    );
  });

  it("renders a cut with no voiceover key and one with [] identically to today, in all three formats", () => {
    const emptyArr: MultishotCut[] = planCuts.map((c) => ({ ...c, voiceover: [] }));
    const expectedOmni =
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
      "[0-2s] A hand sweeps keys off oak.\n" +
      "[2-5s] A cab door swings open onto sunlit paving.";
    const expectedKling =
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
      "shot 1, 2, A hand sweeps keys off oak.;\n" +
      "shot 2, 3, A cab door swings open onto sunlit paving.;";
    const expectedSeedance =
      "Low sun from camera-left, warm grey concrete, 35mm at knee height.\n\n" +
      "0-2s: A hand sweeps keys off oak.\n" +
      "2-5s: A cab door swings open onto sunlit paving.";

    expect(renderPlan(perModelPlan, planCuts, OMNI)).toBe(expectedOmni);
    expect(renderPlan(perModelPlan, emptyArr, OMNI)).toBe(expectedOmni);
    expect(renderPlan(perModelPlan, planCuts, KLING)).toBe(expectedKling);
    expect(renderPlan(perModelPlan, emptyArr, KLING)).toBe(expectedKling);
    expect(renderPlan(perModelPlan, planCuts, SEEDANCE)).toBe(expectedSeedance);
    expect(renderPlan(perModelPlan, emptyArr, SEEDANCE)).toBe(expectedSeedance);
  });

  it("replaces a semicolon inside voiceover text the same way the beat's own is replaced (triple)", () => {
    const cutsWithSemi: MultishotCut[] = [
      { id: "c1", text: "", seconds: 2, voiceover: [{ text: "Wait; then go.", speaker: "narrator" }] },
      { id: "c2", text: "", seconds: 3 },
    ];
    const rendered = renderPlan(perModelPlan, cutsWithSemi, KLING);
    expect(rendered).toContain('shot 1, 2, A hand sweeps keys off oak. Voiceover: "Wait, then go.";');
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

  // D267 (Task 3) — the limit is measured on what is SENT, and the voiceover rides along with the
  // beat. A cut whose beat alone is fine but whose beat-plus-voiceover breaches the cap must be
  // reported, and the reason must say the voiceover is why, so the operator knows which half of
  // the cut to shorten (the voiceover itself is never truncated).
  it("reports a cut whose beat alone fits but beat + voiceover exceeds the per-cut cap", () => {
    const cutsWithVo: MultishotCut[] = [
      { id: "c1", text: "", seconds: 2, voiceover: [{ text: "x".repeat(200), speaker: "narrator" }] },
      { id: "c2", text: "", seconds: 3 },
    ];
    const plan = {
      ...perModelPlan,
      beats: [{ cutId: "c1", text: "y".repeat(400) }, perModelPlan.beats[1]],
    };
    expect(plan.beats[0].text.length).toBeLessThanOrEqual(512);

    const res = checkPlanLimits(plan, cutsWithVo, KLING);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("Shot 1");
      expect(res.reason).toContain("(including its voiceover)");
    }
  });
});

// Replaces the positional `refsCitedIn`: citations are image ids now (BUG-010), and legacy
// positions still count, read in each model's own dialect.
describe("planCitedRefIds per model", () => {
  const one = (text: string): MultishotPlan => ({ version: 1, look: "", beats: [{ cutId: "c1", text }] });
  const ids = ["a", "b"];

  it("reads Omni's zero-based tokens and not Kling's", () => {
    expect([...planCitedRefIds(one("the <IMAGE_REF_1> and <IMAGE_REF_0>"), OMNI, ids)]).toEqual(["b", "a"]);
    expect([...planCitedRefIds(one("the @image_1"), OMNI, ids)]).toEqual([]);
  });

  it("reads Kling's one-based tokens", () => {
    expect([...planCitedRefIds(one("the @image_1 and @image_2"), KLING, ids)]).toEqual(["a", "b"]);
    expect([...planCitedRefIds(one("the <IMAGE_REF_0>"), KLING, ids)]).toEqual([]);
  });

  it("reads Seedance's handles", () => {
    expect([...planCitedRefIds(one("the @Image 1 and @Image 2"), SEEDANCE, ids)]).toEqual(["a", "b"]);
    expect([...planCitedRefIds(one("the @Image 1"), KLING, ids)]).toEqual([]);
  });

  it("reads stored ids in any model", () => {
    expect([...planCitedRefIds(one("the @[File: B.png](b)"), KLING, ids)]).toEqual(["b"]);
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

  it("rejects an empty beat", () => {
    expect(mergeRefinedPlan(plan, "cut", { text: "  " }, "c1", cuts).ok).toBe(false);
  });

  // D262 — rewriting the look on a script that states none SHOULD come back blank. That is the
  // writer following its rule, not failing.
  it("accepts an empty look rewrite, clearing the look", () => {
    const out = mergeRefinedPlan(plan, "look", { look: "   " }, undefined, cuts);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.plan.look).toBe("");
  });

  // The merged whole goes through parsePlan, so a plan whose cut list changed underneath the
  // operator fails here rather than being written with a beat missing.
  it("rejects when the cuts no longer match the plan", () => {
    const fewer: MultishotCut[] = [{ id: "c1", text: "keys", seconds: 2 }];
    expect(mergeRefinedPlan(plan, "look", { look: "New look." }, undefined, fewer).ok).toBe(false);
  });
});

describe("planIsDirty", () => {
  const plan = (over: Partial<MultishotPlan> = {}): MultishotPlan => ({
    version: 1,
    look: "Late afternoon, warm low sun.",
    beats: [
      { cutId: "c1", text: "Tight on a hand lifting keys." },
      { cutId: "c2", text: "A cab door swings open." },
    ],
    ...over,
  });

  it("is not dirty when the draft matches what was saved", () => {
    expect(planIsDirty(plan(), plan())).toBe(false);
  });

  it("is dirty when the look was edited", () => {
    expect(planIsDirty(plan(), plan({ look: "Overcast, flat light." }))).toBe(true);
  });

  it("is dirty when a beat's text was edited", () => {
    const edited = plan({
      beats: [
        { cutId: "c1", text: "Tight on a hand lifting keys." },
        { cutId: "c2", text: "The cab door slams." },
      ],
    });
    expect(planIsDirty(plan(), edited)).toBe(true);
  });

  it("is dirty when the beat count differs", () => {
    const edited = plan({ beats: [{ cutId: "c1", text: "Tight on a hand lifting keys." }] });
    expect(planIsDirty(plan(), edited)).toBe(true);
  });

  it("is dirty when a cutId at the same index differs", () => {
    const edited = plan({
      beats: [
        { cutId: "c1", text: "Tight on a hand lifting keys." },
        { cutId: "c9", text: "A cab door swings open." },
      ],
    });
    expect(planIsDirty(plan(), edited)).toBe(true);
  });

  it("is never dirty with no draft — there is nothing to save", () => {
    expect(planIsDirty(plan(), null)).toBe(false);
    expect(planIsDirty(null, null)).toBe(false);
  });

  it("is dirty when there is a draft but nothing saved", () => {
    expect(planIsDirty(null, plan())).toBe(true);
  });

  // `version` is a schema literal, not an operator-editable field. Comparing it would report a
  // plan dirty on a future schema bump, which is not an unsaved edit.
  it("ignores the schema version", () => {
    const bumped = { ...plan(), version: 2 } as unknown as MultishotPlan;
    expect(planIsDirty(plan(), bumped)).toBe(false);
  });
});

// D236 — the stamp that makes a plan self-describing. Every hop downstream (renderPlan's format,
// refsCitedIn's dialect, video-generate's model guard) reads THIS rather than the Multishot node's
// current `targetModel`, so a stamp silently dropped anywhere in the round trip re-opens the
// silent-reinterpretation bug those hops exist to close.
describe("the plan's targetModel stamp (D236)", () => {
  const stamped = (targetModel: string) => raw({ targetModel });

  it("parsePlan preserves the stamp", () => {
    const result = parsePlan(stamped(KLING_OMNI_MODEL_ID), cuts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.targetModel).toBe(KLING_OMNI_MODEL_ID);
  });

  // ABSENT stays absent — it is not defaulted to Gemini Omni on the way through. Both resolve to
  // Omni at every read site, so "unstamped" and "stamped for the default" behave identically;
  // keeping them distinguishable in stored data is what makes a pre-stamp plan recognisable.
  it("parsePlan omits the stamp when the plan carries none", () => {
    const result = parsePlan(raw(), cuts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.targetModel).toBeUndefined();
    expect("targetModel" in result.plan).toBe(false);
  });

  it("parsePlan ignores a non-string stamp rather than storing one", () => {
    const result = parsePlan(raw({ targetModel: 42 }), cuts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.targetModel).toBeUndefined();
  });

  // A narrow refine rewrites one fragment and leaves the rest as the original writer left it, so
  // the plan must come back out still describing that writer. Losing the stamp on the first look
  // rewrite would quietly demote a Kling plan to Omni's format.
  it("mergeRefinedPlan carries the stamp through a look refine", () => {
    const kling: MultishotPlan = {
      version: 1,
      look: "Late afternoon, warm low sun.",
      beats: cuts.map((c) => ({ cutId: c.id, text: `beat for ${c.id}` })),
      targetModel: KLING_OMNI_MODEL_ID,
    };
    const out = mergeRefinedPlan(kling, "look", { look: "Overcast, flat and soft." }, undefined, cuts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.look).toBe("Overcast, flat and soft.");
    expect(out.plan.targetModel).toBe(KLING_OMNI_MODEL_ID);
  });

  it("mergeRefinedPlan carries the stamp through a cut refine", () => {
    const kling: MultishotPlan = {
      version: 1,
      look: "Late afternoon, warm low sun.",
      beats: cuts.map((c) => ({ cutId: c.id, text: `beat for ${c.id}` })),
      targetModel: KLING_OMNI_MODEL_ID,
    };
    const out = mergeRefinedPlan(kling, "cut", { text: "A palm sweeps keys off oak." }, "c2", cuts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.plan.beats[1].text).toBe("A palm sweeps keys off oak.");
    expect(out.plan.targetModel).toBe(KLING_OMNI_MODEL_ID);
  });

  // The stamp is data the plan carries, not an instruction to renderPlan: format still comes from
  // the capability the CALLER resolved. This pins that the two are wired together only by the
  // caller, so a stamped plan can still be rendered either way for a preview without lying about
  // which one shipped.
  it("does not change what renderPlan does on its own — the caller resolves the capability", () => {
    const stampedPlan = parsePlan(stamped(KLING_OMNI_MODEL_ID), cuts);
    expect(stampedPlan.ok).toBe(true);
    if (!stampedPlan.ok) return;
    expect(renderPlan(stampedPlan.plan, cuts, KLING)).toContain("shot 1, ");
    expect(renderPlan(stampedPlan.plan, cuts, OMNI)).toContain("[0-");
  });
});

// The bug this exists to make unrepresentable: clearing every shot and pasting into the first made
// the text appear in all of them. The proximate cause was a stale closure in the editor's paste
// handler, but what let a stale caller corrupt UNRELATED beats was update logic that read the plan
// from a closure. These pin the properties that make that impossible.
describe("setBeatText", () => {
  const base: MultishotPlan = {
    version: 1,
    look: "Low sun, warm concrete.",
    beats: [
      { cutId: "c1", text: "" },
      { cutId: "c2", text: "" },
      { cutId: "c3", text: "" },
    ],
  };

  it("writes only the named beat, leaving the others EMPTY", () => {
    const next = setBeatText(base, "c1", "pasted text");
    expect(next.beats.map((b) => b.text)).toEqual(["pasted text", "", ""]);
  });

  // Identity, not just equality: an untouched beat must be the SAME object, which is what makes
  // "did this write reach a neighbour?" checkable rather than a matter of reading strings.
  it("keeps untouched beats by reference", () => {
    const next = setBeatText(base, "c2", "only me");
    expect(next.beats[0]).toBe(base.beats[0]);
    expect(next.beats[2]).toBe(base.beats[2]);
    expect(next.beats[1]).not.toBe(base.beats[1]);
  });

  it("never mutates the plan it was given", () => {
    const snapshot = JSON.stringify(base);
    setBeatText(base, "c1", "mutate me");
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("preserves the look and the targetModel stamp", () => {
    const stamped: MultishotPlan = { ...base, targetModel: "seedance:seedance-2-5" };
    const next = setBeatText(stamped, "c1", "x");
    expect(next.look).toBe(stamped.look);
    expect(next.targetModel).toBe("seedance:seedance-2-5");
  });

  it("is a no-op for a cutId that is not in the plan, returning the same object", () => {
    expect(setBeatText(base, "not-a-cut", "x")).toBe(base);
  });

  // Writing each beat in turn must accumulate, not overwrite — the sequence an operator performs
  // when filling in a cleared ladder shot by shot.
  it("accumulates across successive writes", () => {
    let p = base;
    p = setBeatText(p, "c1", "one");
    p = setBeatText(p, "c2", "two");
    p = setBeatText(p, "c3", "three");
    expect(p.beats.map((b) => b.text)).toEqual(["one", "two", "three"]);
  });
});

// D262 — a blank look is sent as NOTHING, not as a blank paragraph. A prompt opening on two empty
// lines reads to the model as a missing section, and wastes Kling's character budget.
describe("renderPlan with no look", () => {
  const noLook: MultishotPlan = { version: 1, look: "", beats: raw().beats };

  it("starts Omni's ladder on the first shot", () => {
    expect(renderPlan(noLook, cuts, OMNI)).toMatch(/^\[0-2s\] Tight on a hand/);
  });

  it("starts Kling's triples on the first shot", () => {
    expect(renderPlan(noLook, cuts, KLING)).toMatch(/^shot 1, 2, Tight on a hand/);
  });

  it("starts Seedance's ladder on the first shot", () => {
    expect(renderPlan(noLook, cuts, SEEDANCE)).toMatch(/^0-2s: Tight on a hand/);
  });
});

describe("plan reference binding (BUG-010)", () => {
  const plan: MultishotPlan = {
    version: 1,
    look: "",
    beats: [
      { cutId: "c1", text: "the jar <IMAGE_REF_1>" },
      { cutId: "c2", text: "the strap <IMAGE_REF_2>" },
    ],
  };
  const twoCuts = [
    { id: "c1", text: "", seconds: 3 },
    { id: "c2", text: "", seconds: 3 },
  ];
  const refs = [
    { id: "a", label: "File: A.png" },
    { id: "b", label: "File: B.png" },
    { id: "c", label: "File: C.png" },
  ];

  it("stores ids, then renders against the images connected now", () => {
    const stored = storePlanRefs(plan, OMNI, refs);
    expect(stored.beats[0].text).toBe("the jar @[File: B.png](b)");
    expect(renderPlan(stored, twoCuts, OMNI, ["b", "c"])).toBe(
      "[0-3s] the jar <IMAGE_REF_0>\n[3-6s] the strap <IMAGE_REF_1>",
    );
  });

  it("reports and names a cited image that is gone", () => {
    const stored = storePlanRefs(plan, OMNI, refs);
    expect(planMissingRefs(stored, OMNI, ["a", "c"])).toEqual([{ id: "b", label: "File: B.png" }]);
  });

  it("renders a plan's beats for the writer, keeping the plan shape", () => {
    const stored = storePlanRefs(plan, OMNI, refs);
    expect(renderPlanRefs(stored, OMNI, ["a", "b", "c"]).beats[0].text).toBe("the jar <IMAGE_REF_1>");
  });

  it("lists cited ids across beats", () => {
    expect([...planCitedRefIds(storePlanRefs(plan, OMNI, refs), OMNI, ["a", "b", "c"])]).toEqual(["b", "c"]);
  });

  it("measures Kling's per-shot limit on the RENDERED beat, not the longer stored id form", () => {
    const beat = `${"x".repeat(500)} @[File: A-very-long-reference-name.png](a)`;
    const p: MultishotPlan = { version: 1, look: "", beats: [{ cutId: "c1", text: beat }] };
    expect(checkPlanLimits(p, [{ id: "c1", text: "", seconds: 3 }], KLING, ["a"])).toEqual({ ok: true });
  });
});
