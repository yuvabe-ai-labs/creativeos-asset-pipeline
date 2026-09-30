import { describe, it, expect } from "vitest";
import {
  multishotPromptGenerate,
  MULTISHOT_PROMPT_ID,
  REFERENCE_IDENTIFICATION_BLOCK,
  MULTISHOT_LOOK_SCHEMA,
  MULTISHOT_BEAT_SCHEMA,
  refineInstruction,
  MULTISHOT_PLAN_SCHEMA,
  planSchemaForCuts,
} from "../multishot-prompt-generate";
import { multishotPromptFor } from "../multishot-prompt-for";
import { multishotPromptKling, MULTISHOT_KLING_PROMPT_ID } from "../multishot-prompt-kling";
import { MULTISHOT_MODELS } from "@/lib/nodes/multishot-models";
import { SEEDANCE_MODEL_ID } from "@/lib/video-gen/client-models";
import {
  MULTISHOT_AUTHORING_MODEL,
  SUBJECT_SILENT_CAMERA,
  VO_PERFORMANCE_RULES,
} from "../video-prompt-generate";

describe("multishotPromptGenerate", () => {
  const spec = multishotPromptGenerate();

  it("carries a stable id for the version record", () => {
    expect(spec.id).toBe(MULTISHOT_PROMPT_ID);
    expect(spec.id).toMatch(/^multishot-prompt-generate@/);
  });

  // The route passes spec.model straight to openai.chat.completions.create.
  it("names the model it runs on", () => {
    expect(spec.model).toBe(MULTISHOT_AUTHORING_MODEL);
  });

  // The schema is the contract parsePlan validates against. If they disagree, every generation
  // is rejected at full price.
  it("asks for a look and beats keyed by cutId, and nothing else", () => {
    const props = spec.schema.properties;
    expect(Object.keys(props).sort()).toEqual(["beats", "look"]);

    const beat = props.beats.items;
    expect(Object.keys(beat.properties).sort()).toEqual(["cutId", "text"]);
    // Durations are the operator's, taken from the cuts. Offering the writer a `seconds` field
    // would let it break the budget the whole design protects.
    expect(Object.keys(beat.properties)).not.toContain("seconds");
    expect([...beat.required].sort()).toEqual(["cutId", "text"]);
  });

  // OpenAI structured outputs with strict: true REQUIRE additionalProperties: false and a complete
  // `required` array at EVERY level of the schema. Missing either breaks generation at full price,
  // and the property-name assertions above wouldn't catch it.
  it("is a valid strict-mode schema at both the root and the beat item", () => {
    const root = spec.schema;
    expect(root.additionalProperties).toBe(false);
    expect([...root.required].sort()).toEqual(["beats", "look"]);

    const beat = root.properties.beats.items;
    expect(beat.additionalProperties).toBe(false);
    expect([...beat.required].sort()).toEqual(["cutId", "text"]);
  });

  it("reuses the canonical reference-identification block rather than a copy", () => {
    expect(spec.system).toContain(REFERENCE_IDENTIFICATION_BLOCK);
  });

  it("tells the writer to open with the look and to echo each cutId exactly", () => {
    expect(spec.system).toMatch(/look/i);
    expect(spec.system).toMatch(/cutId/);
  });

  // The levitation bug: a generated crane clause ("...lifts gently upward so the jar feels more
  // elevated") made Kling literally levitate the product off its plinth, because an i2v model
  // executes subject-state language as subject motion. This prompt asks the model to write camera
  // movement per beat and is exposed to the identical failure mode — do not "tidy away" this guard.
  it("carries the subject-silent camera guard so per-beat camera movement can't relitigate the levitation bug", () => {
    expect(spec.system).toContain(SUBJECT_SILENT_CAMERA);
  });

  // Added after the operator reported generations "missing even basic things of laws of physics"
  // and shots that "aren't being got right". Both trace to guidance this prompt did not carry:
  // nothing told the writer to stay faithful to the operator's shot text, nothing capped a beat at
  // one action (Omni blends competing actions, and blending is what reads as melting/sliding), and
  // nothing asked for surface contact. These are the three most likely to be shortened away by
  // someone trimming a long prompt, so they are pinned.
  it("holds the writer to the operator's shot text rather than substituting its own", () => {
    expect(spec.system).toMatch(/shot text is the brief/i);
  });

  it("caps a beat at one dominant action", () => {
    expect(spec.system).toMatch(/one dominant action/i);
  });

  // The fix for sliding and hovering survives D263's trim: it is one short line now, not a
  // five-rule physics section, but a subject still has to be told to stay grounded.
  it("keeps subjects grounded, the fix for sliding and hovering", () => {
    expect(spec.system).toMatch(/keeps contact/i);
    expect(spec.system).toMatch(/floats, hovers or slides/i);
  });

  // D233: the writer identifies a reference but never binds it. It used to assign
  // `<IMAGE_REF_N>` itself, which fails silently — a token pointing at the wrong photograph
  // raises no error and is only visible in a clip already paid for. The operator attaches the
  // reference by hand instead, so the writer must name what it saw in prose and stop there.
  it("forbids the writer from assigning reference tokens itself", () => {
    expect(spec.system).toMatch(/do not write reference tokens/i);
    expect(spec.system).toMatch(/<IMAGE_REF_0>/);
    expect(spec.system).toMatch(/the operator's decision/i);
  });

  // The identifying phrase is what survives the loss of the token: it is how the operator knows
  // which attachment a beat meant, and so which one to attach.
  it("still asks the writer to look at the images and name what it saw", () => {
    expect(spec.system).toMatch(/LOOK AT THEM/);
    expect(spec.system).toMatch(/name what you saw/i);
    expect(spec.system).toMatch(/black CHUPPS V-Straps/);
  });

  // A CHUPPS logo on white was attached alongside three product shots and the writer cited it as
  // if it were a slipper — the beat then asked the model to animate a wordmark as footwear. The
  // identification list named only "product, garment, person or surface", so a brand mark had no
  // category and fell to the nearest one it knew.
  it("classifies a brand mark as a graphic, never as a product to name", () => {
    expect(spec.system).toMatch(/brand mark/i);
    expect(spec.system).toMatch(/never name it as a product/i);
  });

  // The end-card case: a shot saying "...followed by logo" must produce the framing the mark will
  // sit in, not an attempt to render the mark. This codebase's standing position is that a brand
  // lock-up is composited in post, because generated lettering is not typographically exact.
  it("sends a logo end-card to post rather than asking the model to render it", () => {
    expect(spec.system).toMatch(/composited in post/i);
  });
});

describe("narrow refine schemas", () => {
  it("the look schema asks for the look alone", () => {
    expect(MULTISHOT_LOOK_SCHEMA.required).toEqual(["look"]);
    expect(MULTISHOT_LOOK_SCHEMA.additionalProperties).toBe(false);
    expect(Object.keys(MULTISHOT_LOOK_SCHEMA.properties)).toEqual(["look"]);
  });

  it("the beat schema asks for the text alone", () => {
    expect(MULTISHOT_BEAT_SCHEMA.required).toEqual(["text"]);
    expect(MULTISHOT_BEAT_SCHEMA.additionalProperties).toBe(false);
    expect(Object.keys(MULTISHOT_BEAT_SCHEMA.properties)).toEqual(["text"]);
  });
});

describe("refineInstruction", () => {
  const plan = { version: 1 as const, look: "Warm low sun.", beats: [{ cutId: "c1", text: "Keys." }] };

  it("names the beat being rewritten and carries the plan as context", () => {
    const out = refineInstruction({ scope: "cut", cutId: "c1", note: "", plan });
    expect(out).toContain("c1");
    expect(out).toContain("Warm low sun.");
    expect(out).toMatch(/only the text for that shot/i);
  });

  it("asks for the look alone on a look refine", () => {
    const out = refineInstruction({ scope: "look", cutId: null, note: "", plan });
    expect(out).toMatch(/only the look/i);
  });

  // A one-off steer and a permanent brief are different things. Folding the note into the standing
  // instruction would make "try it darker" part of the shot's definition on every later generate.
  it("puts the note in its own block, only when there is one", () => {
    const withNote = refineInstruction({ scope: "look", cutId: null, note: "colder", plan });
    expect(withNote).toContain("Apply this change, and only this change: colder");

    const without = refineInstruction({ scope: "look", cutId: null, note: "   ", plan });
    expect(without).not.toContain("Apply this change");
  });

  // Regression test for the Critical: scope "all" used to return "" unconditionally, so the
  // header's "Refine the whole sequence with AI" note was validated, capped and recorded on the
  // version row, but never reached the model — it billed a plain regenerate while claiming a
  // steer was applied.
  it("carries the note on a whole-sequence refine, without the narrow scopes' framing", () => {
    const out = refineInstruction({ scope: "all", cutId: null, note: "punchier", plan });
    expect(out).toContain("punchier");
    expect(out).not.toMatch(/everything else stays as it is/i);
  });

  // "Change shots 5 and 6" is only answerable if the writer can SEE the beats it is meant to
  // leave alone. Without the plan there is nothing to copy from, so it rewrote everything.
  it("sends the current plan and asks for untouched beats back verbatim", () => {
    const out = refineInstruction({ scope: "all", cutId: null, note: "change shot 2", plan });
    expect(out).toContain(JSON.stringify(plan, null, 2));
    expect(out).toMatch(/rewrite ONLY those/);
    expect(out).toMatch(/character for character/i);
    expect(out).toMatch(/If the change names no shot in particular, rewrite the whole sequence/i);
  });

  // A plain Generate must still write fresh. Handing it the previous output would anchor it to
  // the very thing it is replacing.
  it("does not send the plan when there is no note", () => {
    expect(refineInstruction({ scope: "all", cutId: null, note: "  ", plan })).toBe("");
  });

  it("omits the preservation block on a first generate, which has no plan", () => {
    const out = refineInstruction({
      scope: "all",
      cutId: null,
      note: "punchier",
      plan: { look: "", beats: [] },
    });
    expect(out).toContain("punchier");
    expect(out).not.toMatch(/character for character/i);
  });

  it("returns nothing for a full generate with a blank note", () => {
    expect(refineInstruction({ scope: "all", cutId: null, note: "   ", plan })).toBe("");
  });

  // The signature allows scope: "cut" with cutId: null even though the route should never send
  // that combination. Left unguarded, this falls through to a broken instruction — "Rewrite ONLY
  // the beat whose cutId is null" — sent straight to the model. The model answers it as best it
  // can and nothing flags the mistake; it's only visible in a beat rewritten against the wrong
  // (or no) cut. Throwing here turns a silent bad prompt into a loud programmer error instead.
  it("throws rather than emit a broken instruction for a cut refine with no cutId", () => {
    expect(() => refineInstruction({ scope: "cut", cutId: null, note: "", plan })).toThrow(
      /cutId/,
    );
  });
});

// D262 — the look comes only from what the script or the operator states, and the brand context is
// never a source of setting. Checked on EVERY model's writer, since all three share these blocks and
// a writer that dropped one would quietly go back to inventing monsoons.
describe("no assumed look or setting (D262)", () => {
  const systems = MULTISHOT_MODELS.map((m) => [m.label, multishotPromptFor(m.id).system] as const);

  it("tells every writer to leave the look empty when nothing states one", () => {
    for (const [label, system] of systems) {
      expect(system, label).toMatch(/return an empty string/i);
    }
  });

  it("tells every writer the brand context is not a source of setting", () => {
    for (const [label, system] of systems) {
      expect(system, label).toMatch(/brand context/i);
      expect(system, label).toMatch(/weather, season, time of day/i);
    }
  });

  // The old physics example put rain in every writer's head.
  it("no longer seeds wet weather through its examples", () => {
    for (const [label, system] of systems) {
      expect(system, label).not.toMatch(/wet asphalt/i);
    }
  });

  it("tells the schema an empty look is allowed", () => {
    expect(MULTISHOT_PLAN_SCHEMA.properties.look.description).toMatch(/empty/i);
    expect(MULTISHOT_LOOK_SCHEMA.properties.look.description).toMatch(/empty/i);
  });
});

// The fix for the intermittent "The writer referenced a shot that isn't in this node." 422: cut ids
// are UUIDs the writer used to transcribe by instruction alone, and one slipped character rejected
// the whole plan at full price. With `enum`, strict structured outputs constrain decoding, so a
// foreign id is unrepresentable rather than caught.
describe("planSchemaForCuts", () => {
  const CUT_IDS = ["9f1c3a7e-2b44-4d51-8a0e-1c7d6f0b2e93", "0b8e5d21-7c3f-42aa-9de4-5f6a1b8c0d77"];
  const cutIdSchema = (schema: Record<string, unknown>) =>
    // Walked rather than destructured so a schema whose shape drifts fails here loudly.
    (schema.properties as Record<string, { items: { properties: { cutId: Record<string, unknown> } } }>)
      .beats.items.properties.cutId;

  it("constrains cutId to exactly the ids it was given", () => {
    expect(cutIdSchema(planSchemaForCuts(CUT_IDS)).enum).toEqual(CUT_IDS);
  });

  // The whole point: the model cannot emit an id that is not the node's.
  it("does not admit an id the node does not have", () => {
    const allowed = cutIdSchema(planSchemaForCuts(CUT_IDS)).enum as string[];
    // A one-character slip in the first id — the exact shape of the bug this fixes.
    expect(allowed).not.toContain("9f1c3a7e-2b44-4d51-8a0e-1c7d6f0b2e83");
  });

  // Strict mode needs additionalProperties: false and a complete `required` at EVERY level. The
  // enum is a narrowing of one leaf; a spread that lost either would break generation at full price.
  it("stays a valid strict-mode schema", () => {
    const schema = planSchemaForCuts(CUT_IDS) as {
      additionalProperties: boolean;
      required: string[];
      properties: {
        beats: { items: { additionalProperties: boolean; required: string[]; properties: object } };
      };
    };
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(["beats", "look"]);

    const beat = schema.properties.beats.items;
    expect(beat.additionalProperties).toBe(false);
    expect([...beat.required].sort()).toEqual(["cutId", "text"]);
    expect(Object.keys(beat.properties).sort()).toEqual(["cutId", "text"]);
  });

  // Built per request from a module-level constant: a mutating implementation would leak one node's
  // cut ids into the next request's schema, which on a busy server is a cross-node plan rejection.
  it("leaves the canonical schema untouched", () => {
    planSchemaForCuts(CUT_IDS);
    expect(MULTISHOT_PLAN_SCHEMA.properties.beats.items.properties.cutId).not.toHaveProperty("enum");
  });

  // `enum: []` is unsatisfiable and OpenAI rejects the request outright. The route 400s a node with
  // no cuts long before here, so this only has to not make things worse.
  it("returns the unconstrained schema when there are no cuts", () => {
    expect(planSchemaForCuts([])).toBe(MULTISHOT_PLAN_SCHEMA);
  });

  // planSchemaForCuts derives from MULTISHOT_PLAN_SCHEMA instead of the spec's own `schema`, which
  // is only sound while every writer answers against that one object (D238). If a writer ever forks
  // its schema, this fails HERE rather than that writer silently getting Omni's shape.
  it("is derived from the schema every writer actually answers against", () => {
    for (const m of MULTISHOT_MODELS) {
      expect(multishotPromptFor(m.id).schema, m.label).toBe(MULTISHOT_PLAN_SCHEMA);
    }
  });
});

// D263 — the operator reported the motion "overcomplicated". Every rule below asked the writer to
// narrate one more motion per beat, and every narrated motion is one more thing the video model
// tries to animate. Pinned OUT on every writer so a later "prompt quality" pass cannot quietly
// restore them.
describe("simple motion (D263)", () => {
  const systems = MULTISHOT_MODELS.map((m) => [m.label, multishotPromptFor(m.id).system] as const);

  it("tells every writer to write the action as the shot text puts it and stop", () => {
    for (const [label, system] of systems) {
      expect(system, label).toMatch(/keep the motion simple/i);
      expect(system, label).toMatch(/static or on one slow, simple move/i);
    }
  });

  it("no longer asks any writer to narrate physics or choreography", () => {
    const removed = [
      /force verbs/i,
      /takes the weight/i,
      /let materials behave/i,
      /heel-first/i,
      /30 degrees/i,
      /screen direction/i,
      /timing of small movements/i,
      /micro-detail/i,
    ];
    for (const [label, system] of systems) {
      for (const pattern of removed) expect(system, `${label} ${pattern}`).not.toMatch(pattern);
    }
  });
});

// D267 (Task 5) — inverts the old "voiceover rule" below it. Asked to write every line of a whole
// reel's voiceover into one node's beats ("no line is dropped"), the writer kept one and dropped
// the rest on a short sequence — trading a shot's own action away to fit a line that belonged to a
// different clip entirely. The writer no longer writes the words at all: `renderPlan`
// (src/lib/nodes/multishot-plan.ts) appends each cut's own voiceover to its beat in code, so a line
// the writer never places is a line it cannot misplace. VO_PERFORMANCE_RULES (shared verbatim by
// every writer, single-take and multishot) tells it a line is coming and how to frame for it,
// without handing it anything to write.
describe("voiceover performance rules", () => {
  it("is in every multishot writer's system prompt, verbatim", () => {
    for (const m of MULTISHOT_MODELS) {
      const system = multishotPromptFor(m.id).system;
      expect(system, m.label).toContain(VO_PERFORMANCE_RULES);
    }
  });

  it("forbids writing the words and covers both speaker kinds", () => {
    expect(VO_PERFORMANCE_RULES).toContain("NEVER write, quote or paraphrase them");
    expect(VO_PERFORMANCE_RULES).toContain("ON SCREEN");
    expect(VO_PERFORMANCE_RULES).toContain("NARRATOR");
  });

  // ALSO IN SCOPE — Seedance's own {} dialogue marker is gone; the renderer owns dialogue now.
  // Its () music and <> sound-effect markers are untouched.
  it("seedance no longer asks for {} dialogue; its music and effects markers stay", () => {
    const system = multishotPromptFor(SEEDANCE_MODEL_ID).system;
    expect(system).not.toContain("{} for dialogue");
    expect(system).toContain("() for music");
    expect(system).toContain("<> for sound effects");
  });
});

// D281 — an operator attached a three-angle character turnaround on a grey seamless, and the
// writer put a light studio backdrop into the look. Both writers share this rule.
describe("references are identity-only (D281)", () => {
  const writers = [
    ["Omni", multishotPromptGenerate().system],
    ["Kling", multishotPromptKling().system],
  ] as const;

  it.each(writers)("%s: a reference carries identity, never its backdrop or light", (_, system) => {
    expect(system).toMatch(/A REFERENCE IS IDENTITY ONLY/);
    expect(system).toMatch(/backdrop, studio lighting/i);
    expect(system).toMatch(/identity sheet, never a location/i);
  });

  it.each(writers)("%s: takes look from a reference only when the direction says so", (_, system) => {
    expect(system).toMatch(/unless the operator's direction/i);
    expect(system).toMatch(/names a reference as the source of the look/i);
  });

  it.each(writers)("%s: still forbids writing the reference numbers into beats", (_, system) => {
    expect(system).toMatch(/"reference image 2"/);
  });

  it("bumps both prompt ids", () => {
    expect(MULTISHOT_PROMPT_ID).toBe("multishot-prompt-generate@10");
    expect(MULTISHOT_KLING_PROMPT_ID).toBe("multishot-prompt-kling@7");
  });
});
