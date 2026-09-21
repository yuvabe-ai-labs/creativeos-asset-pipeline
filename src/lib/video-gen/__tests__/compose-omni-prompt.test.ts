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

  // The Audio select and the On-screen Text box were removed from the node (operator request
  // 2026-09-03), so both clauses are now FIXED. These four cases replace the ones that exercised
  // the choices — the point of each is that removing a CONTROL did not remove the BEHAVIOUR it
  // governed, and that a param saved before the removal can no longer resurrect it.

  it("always requests the dialogue mix, whatever params carry", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toContain("Sound design: ambience, foley and the spoken line. No background music.");
  });

  // The one that would actually cost money: Omni cannot be silenced, so dropping the clause would
  // hand every generation a music bed that changes character at each cut. A node saved while the
  // control still existed still carries `audio: "music"` in its params — it must be inert now.
  it("ignores a stale saved audio choice rather than letting it reinstate a music bed", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: { audio: "music" }, plan: EMPTY });
    expect(out).toContain("No background music.");
    expect(out).not.toContain("a music bed");
  });

  // Omni invents signage and captions unasked, so silence is requested explicitly — on every shot
  // now that there is no opt-in left.
  it("suppresses on-screen text unconditionally", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toContain("No on-screen text.");
  });

  it("ignores stale saved on-screen copy rather than quoting it", () => {
    const out = composeOmniPrompt({
      prompt: "A cup.", params: { on_screen_text: "Pure by nature" }, plan: EMPTY,
    });
    expect(out).toContain("No on-screen text.");
    expect(out).not.toContain("Pure by nature");
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
