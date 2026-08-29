import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePromptFor,
  videoPromptGenerateOmniPrompt,
  SINGLE_TAKE_LINE,
} from "../video-prompt-generate";
import { renderShotLadder } from "@/lib/nodes/render-shot-for-video";

describe("videoPromptGeneratePromptFor", () => {
  it("routes gemini-omni to the ladder variant", () => {
    expect(videoPromptGeneratePromptFor("gemini-omni").id).toBe(videoPromptGenerateOmniPrompt.id);
  });

  it("still routes kling and veo as before", () => {
    expect(videoPromptGeneratePromptFor("kling").id).toBe("video-prompt-generate-kling");
    expect(videoPromptGeneratePromptFor("veo").id).toBe("video-prompt-generate");
  });

  // Omni cuts by default, so a single take must be REQUESTED — the inverse of every other model.
  it("tells the Omni variant to write a timecode ladder", () => {
    expect(videoPromptGenerateOmniPrompt.system).toContain("[0-");
    expect(videoPromptGenerateOmniPrompt.system).toMatch(/timecode/i);
  });
});

describe("renderShotLadder", () => {
  it("lays consecutive beats end to end from their lengths", () => {
    expect(
      renderShotLadder({
        visual_script: {
          shots: [
            { description: "hands lift the jar", duration_seconds: 4 },
            { description: "macro on the lid", duration_seconds: 5 },
          ],
        },
      }),
    ).toBe("[0-4s] hands lift the jar\n[4-9s] macro on the lid");
  });

  it("uses the 4s assumption for a beat with no length", () => {
    expect(
      renderShotLadder({ visual_script: { shots: [{ description: "a" }, { description: "b" }] } }),
    ).toBe("[0-4s] a\n[4-8s] b");
  });

  it("returns an empty string for no shots", () => {
    expect(renderShotLadder({ visual_script: { shots: [] } })).toBe("");
    expect(renderShotLadder(null)).toBe("");
  });
});
