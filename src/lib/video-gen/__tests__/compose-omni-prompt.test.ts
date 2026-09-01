import { describe, it, expect } from "vitest";
import { composeOmniPrompt } from "../compose-omni-prompt";
import { planOmniInput } from "../plan-omni-input";

const EMPTY = planOmniInput({ startFrameUrl: undefined, endFrameUrl: undefined, referenceUrls: [] });
const FRAME = planOmniInput({ startFrameUrl: "https://x/s.jpg", endFrameUrl: undefined, referenceUrls: [] });

describe("composeOmniPrompt", () => {
  it("puts the declaration header first and the role guidance last", () => {
    const out = composeOmniPrompt({
      prompt: "A cup on a table.", params: { audio: "ambient" }, plan: FRAME,
    });
    expect(out.startsWith("[# Sources <FIRST_FRAME>@Image1]")).toBe(true);
    expect(out.endsWith("Use Image1 as the starting frame.")).toBe(true);
  });

  // Most reels here carry a voiceover, so speech is the default and MUSIC is what gets
  // suppressed — a per-generation score changes character at every cut.
  it("defaults to the dialogue clause when audio is absent", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toContain("Sound design: ambience, foley and the spoken line. No background music.");
    expect(out).not.toContain("No dialogue.");
  });

  // The rule is "absent OR unrecognised" — a node saved against a different model can carry an
  // audio value this model has no clause for, and it must not fall through to no clause at all.
  it("falls back to the dialogue clause for an unrecognised audio value", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { audio: "explosions" }, plan: EMPTY,
    });
    expect(out).toContain("Sound design: ambience, foley and the spoken line. No background music.");
  });

  // Ambient is the deliberate no-speech choice, not the default.
  it("suppresses dialogue only when ambient is chosen", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: { audio: "ambient" }, plan: EMPTY });
    expect(out).toContain("Sound design: ambience and foley only. No dialogue. No background music.");
  });

  it("allows a music bed only when music is chosen", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: { audio: "music" }, plan: EMPTY });
    expect(out).toContain("Sound design: ambience, foley and a music bed.");
    expect(out).not.toContain("No background music.");
  });

  // Omni invents signage and captions unasked, so silence is requested explicitly — but only
  // when the operator has not supplied copy, or the two lines would contradict each other.
  it("suppresses on-screen text when none was asked for", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toContain("No on-screen text.");
  });

  it("does not suppress on-screen text when copy was supplied", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { on_screen_text: "Pure by nature" }, plan: EMPTY,
    });
    expect(out).toContain('On-screen text reads exactly: "Pure by nature".');
    expect(out).not.toContain("No on-screen text.");
  });

  // Omni renders screen-space type legibly and the docs recommend quoting it exactly.
  it("quotes on-screen text when given", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { on_screen_text: "Pure by nature" }, plan: EMPTY,
    });
    expect(out).toContain('On-screen text reads exactly: "Pure by nature".');
  });

  it("omits the on-screen text sentence when the field is blank", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { on_screen_text: "   " }, plan: EMPTY,
    });
    expect(out).not.toContain("On-screen text");
  });

  // No negative-prompt field exists on this model, so the list is a sentence.
  it("renders the negative prompt as its own Avoid paragraph", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { negative_prompt: "blurry, warped label" }, plan: EMPTY,
    });
    expect(out).toContain("\n\nAvoid: blurry, warped label.");
  });

  it("leaves no dangling Avoid when the negative prompt is cleared", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { negative_prompt: "   " }, plan: EMPTY,
    });
    expect(out).not.toContain("Avoid:");
  });

  // The whole default output, pinned exactly — the prompt, the audio clause, and the two
  // standing suppressions. Nothing else is added on a bare shot.
  it("emits the prompt, the audio clause and the on-screen-text suppression by default", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toBe(
      "A cup.\n\n" +
        "Sound design: ambience, foley and the spoken line. No background music.\n\n" +
        "No on-screen text.",
    );
  });
});
