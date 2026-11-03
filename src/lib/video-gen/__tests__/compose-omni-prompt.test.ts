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

  // D472 — the sound clause follows what the prompt asks to be spoken. It was one fixed line
  // ("ambience, foley and the spoken line") on every request, so a clip with no line was told to
  // have one and the model made one up (staging: CaratLane Reel 02, every clip).
  it("says nobody speaks when the prompt has no line", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toContain("Sound design: ambience and foley only. Nobody speaks: no dialogue, no voiceover, no narration, no singing. No background music.");
    expect(out).not.toContain("the spoken line");
  });

  it("keeps a voiceover off-screen, with no lips moving on screen", () => {
    const out = composeOmniPrompt({ prompt: 'Spoken over the whole sequence, in order: Voiceover, off-screen: "Try it."\n\n[0-3s] A cup.', params: {}, plan: EMPTY });
    expect(out).toContain("the voiceover, spoken off-screen in exactly the words given and nothing more. Nobody on screen speaks or moves their lips as if talking.");
  });

  it("gives an on-camera line to the person named, and nobody else", () => {
    const out = composeOmniPrompt({ prompt: 'Riya says on camera: "Try it."\n\n[0-3s] Riya at the counter.', params: {}, plan: EMPTY });
    expect(out).toContain("each said on camera by the person named, in exactly the words given. Nobody else speaks, and there is no voiceover.");
  });

  // D474 — a 4s clip's voiceover began at 2.7s and was cut off at the end (CaratLane Reel 02).
  it("says when speech starts and that it ends before the clip does, only when someone speaks", () => {
    const timing = "Speaking starts within the first second and every line is finished before the clip ends; no line is cut off.";
    expect(composeOmniPrompt({ prompt: 'Voiceover, off-screen: "Try it."', params: {}, plan: EMPTY })).toContain(timing);
    expect(composeOmniPrompt({ prompt: 'Riya says on camera: "Try it."', params: {}, plan: EMPTY })).toContain(timing);
    expect(composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY })).not.toContain("Speaking starts");
  });

  it("handles both, and reads a prompt written before the wording changed", () => {
    expect(composeOmniPrompt({ prompt: 'Voiceover, off-screen: "One." Riya says on camera: "Two."', params: {}, plan: EMPTY }))
      .toContain("the voiceover spoken off-screen, and each on-camera line said by the person named. Nobody else speaks.");
    expect(composeOmniPrompt({ prompt: 'Across every shot — Voiceover (warm): "Old shape."', params: {}, plan: EMPTY }))
      .toContain("Nobody on screen speaks or moves their lips");
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

  // The whole default output, pinned exactly — the prompt, the sound clause, and the standing
  // suppression. Nothing else is added on a bare shot.
  it("emits the prompt, the sound clause and the on-screen-text suppression by default", () => {
    const out = composeOmniPrompt({ prompt: "A cup.", params: {}, plan: EMPTY });
    expect(out).toBe(
      "A cup.\n\n" +
        "Sound design: ambience and foley only. Nobody speaks: no dialogue, no voiceover, no narration, no singing. No background music.\n\n" +
        "No on-screen text.",
    );
  });
});
