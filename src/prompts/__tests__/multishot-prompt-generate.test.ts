import { describe, it, expect } from "vitest";
import {
  multishotPromptGenerate,
  MULTISHOT_PROMPT_ID,
  REFERENCE_IDENTIFICATION_BLOCK,
  MULTISHOT_LOOK_SCHEMA,
  MULTISHOT_BEAT_SCHEMA,
  refineInstruction,
} from "../multishot-prompt-generate";
import { MULTISHOT_AUTHORING_MODEL, SUBJECT_SILENT_CAMERA } from "../video-prompt-generate";

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

  it("asks for named surface contact, the fix for sliding and hovering", () => {
    expect(spec.system).toMatch(/name the surface and the contact/i);
    expect(spec.system).toMatch(/keeps contact/i);
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
