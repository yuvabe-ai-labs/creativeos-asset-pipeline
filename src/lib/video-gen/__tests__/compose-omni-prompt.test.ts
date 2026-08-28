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

  it("defaults to the ambient audio clause when audio is absent", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toContain(
      "Sound design: ambience and foley only. No dialogue. No extra sound effects.",
    );
  });

  it("uses the dialogue clause and does not suppress dialogue", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: { audio: "dialogue" }, plan: EMPTY });
    expect(out).toContain("Sound design: ambience, foley and natural dialogue.");
    expect(out).not.toContain("No dialogue.");
  });

  it("uses the music clause", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: { audio: "music" }, plan: EMPTY });
    expect(out).toContain("Sound design: ambience and foley, with a music bed. No dialogue.");
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

  it("emits only the prompt and the audio clause with nothing else set", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toBe(
      "A cup.\n\nSound design: ambience and foley only. No dialogue. No extra sound effects.",
    );
  });
});
