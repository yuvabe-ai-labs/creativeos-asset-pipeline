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

  it("is preservation-first: restates the fixed identity, with no word cap", () => {
    const sys = videoPromptGeneratePrompt.system.toLowerCase();
    expect(sys).toContain("restate the fixed");
    expect(sys).toContain("held exactly");
    expect(videoPromptGeneratePrompt.system).not.toMatch(/40[–-]90 words/);
  });

  it("is version 3 and keeps hype-word hygiene", () => {
    expect(videoPromptGeneratePrompt.version).toBe(3);
    expect(videoPromptGeneratePrompt.system).toContain("cinematic masterpiece");
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
