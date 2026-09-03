import { describe, it, expect } from "vitest";
import {
  multishotPromptGenerate,
  MULTISHOT_PROMPT_ID,
  REFERENCE_IDENTIFICATION_BLOCK,
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
});
