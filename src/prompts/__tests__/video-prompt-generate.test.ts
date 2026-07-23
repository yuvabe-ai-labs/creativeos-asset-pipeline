import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePrompt,
  videoPromptGenerateKlingPrompt,
  videoPromptGeneratePromptFor,
} from "../video-prompt-generate";

describe("videoPromptGeneratePrompt", () => {
  it("is a versioned, evaluable record", () => {
    expect(videoPromptGeneratePrompt.id).toBe("video-prompt-generate");
    expect(videoPromptGeneratePrompt.version).toBeGreaterThanOrEqual(1);
    expect(typeof videoPromptGeneratePrompt.model).toBe("string");
    expect(videoPromptGeneratePrompt.system.length).toBeGreaterThan(100);
  });

  it("instructs no scene re-description (image-to-video grounding)", () => {
    expect(videoPromptGeneratePrompt.system.toLowerCase()).toContain("do not re-describe");
  });
});

describe("videoPromptGeneratePromptFor", () => {
  it("returns the text-camera record for veo and sora(openai)", () => {
    expect(videoPromptGeneratePromptFor("veo").id).toBe("video-prompt-generate");
    expect(videoPromptGeneratePromptFor("openai").id).toBe("video-prompt-generate");
  });

  it("returns the external-camera record for kling", () => {
    expect(videoPromptGeneratePromptFor("kling").id).toBe("video-prompt-generate-kling");
  });

  it("kling variant is camera-silent and keeps hype-word hygiene", () => {
    const sys = videoPromptGenerateKlingPrompt.system;
    expect(sys).toMatch(/do\s+NOT describe any camera/i);
    expect(sys).toContain("cinematic masterpiece");
  });
});
