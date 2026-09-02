import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePromptFor,
  videoPromptGenerateOmniPrompt,
  SINGLE_TAKE_LINE,
} from "../video-prompt-generate";

describe("videoPromptGeneratePromptFor", () => {
  it("routes gemini-omni to the ladder variant", () => {
    expect(videoPromptGeneratePromptFor({ provider: "gemini-omni", multishot: true }).id).toBe(videoPromptGenerateOmniPrompt.id);
  });

  it("still routes kling and veo as before", () => {
    expect(videoPromptGeneratePromptFor({ provider: "kling", multishot: false }).id).toBe("video-prompt-generate-kling");
    expect(videoPromptGeneratePromptFor({ provider: "veo", multishot: false }).id).toBe("video-prompt-generate");
  });

  // Omni cuts by default, so a single take must be REQUESTED — the inverse of every other model.
  it("tells the Omni variant to write a timecode ladder", () => {
    expect(videoPromptGenerateOmniPrompt.system).toContain("[0-");
    expect(videoPromptGenerateOmniPrompt.system).toMatch(/timecode/i);
  });
});
