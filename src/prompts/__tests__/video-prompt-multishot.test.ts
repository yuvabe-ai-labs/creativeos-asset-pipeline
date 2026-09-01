import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePromptFor,
  videoPromptGenerateOmniPrompt,
  videoPromptGenerateKlingPrompt,
  videoPromptGeneratePrompt,
} from "../video-prompt-generate";

describe("videoPromptGeneratePromptFor", () => {
  it("routes a multishot Omni shot to the ladder prompt", () => {
    expect(videoPromptGeneratePromptFor({ provider: "gemini-omni", multishot: true }).id).toBe(
      videoPromptGenerateOmniPrompt.id,
    );
  });

  // A single shot on Omni is one continuous take. Handing it the ladder prompt produces a
  // one-line ladder ending "keep these timings exactly", which forbids the very cutting a
  // single-beat multishot node is asking for.
  it("routes a single Omni shot to the default prompt", () => {
    expect(videoPromptGeneratePromptFor({ provider: "gemini-omni", multishot: false }).id).toBe(
      videoPromptGeneratePrompt.id,
    );
  });

  it("still routes kling and veo by provider, ignoring multishot", () => {
    expect(videoPromptGeneratePromptFor({ provider: "kling", multishot: true }).id).toBe(
      videoPromptGenerateKlingPrompt.id,
    );
    expect(videoPromptGeneratePromptFor({ provider: "kling", multishot: false }).id).toBe(
      videoPromptGenerateKlingPrompt.id,
    );
    expect(videoPromptGeneratePromptFor({ provider: "veo", multishot: true }).id).toBe(
      videoPromptGeneratePrompt.id,
    );
  });
});

describe("the Omni multishot prompt carries the guidance", () => {
  const s = videoPromptGenerateOmniPrompt.system;

  // §10 — the LOOK is the only thing making separate cuts read as one film, and paraphrase IS
  // drift. The prompt has to forbid rewriting it, not merely mention it.
  it("requires the LOOK block reproduced verbatim", () => {
    expect(s).toMatch(/LOOK/);
    expect(s).toMatch(/verbatim|character-for-character/i);
    expect(s).toMatch(/never paraphrase/i);
  });

  it("fixes the per-beat order as framing, subject, camera, light", () => {
    expect(s).toMatch(/framing[\s\S]*subject[\s\S]*camera[\s\S]*light/i);
  });

  it("requires camera moves to name their invariant", () => {
    expect(s).toMatch(/invariant/i);
    expect(s).toContain("constant focal length");
  });

  // The failure that made Kling levitate a product off its plinth: an i2v model executes
  // subject-state language as subject MOTION.
  it("forbids a camera clause describing an effect on the subject", () => {
    expect(s).toMatch(/never describe an effect on the subject/i);
    expect(s).toMatch(/subject-state language as subject/i);
  });

  it("puts negatives inline at the end, since there is no negative field", () => {
    expect(s).toMatch(/no negative-prompt field/i);
    expect(s).toMatch(/inline/i);
  });

  // §5 — naming a reference once at the top loses it by the third beat.
  it("requires a reference to be named in every beat it appears in", () => {
    expect(s).toMatch(/every beat it appears in/i);
    expect(s).toMatch(/never describe a referenced subject's own design/i);
  });

  // §4 — the docs speak in frames at 24fps for sub-second beats, which the model reads better.
  it("asks for sub-second intervals in frames at 24fps", () => {
    expect(s).toContain("24fps");
  });

  // §6 — audio is always generated and there is no voice control at all.
  it("requires a Sound design clause and warns off dialogue", () => {
    expect(s).toMatch(/Sound design:/);
    expect(s).toMatch(/no voice control/i);
  });

  it("keeps the timings it is given", () => {
    expect(s).toMatch(/keep them exactly|consecutively from 0/i);
  });

  it("bans hype adjectives", () => {
    expect(s).toContain("cinematic masterpiece");
  });

  it("is a versioned record like its siblings", () => {
    expect(videoPromptGenerateOmniPrompt.id).toBe("video-prompt-generate-omni");
    expect(videoPromptGenerateOmniPrompt.version).toBeGreaterThanOrEqual(2);
    expect(videoPromptGenerateOmniPrompt.model.length).toBeGreaterThan(0);
  });
});
