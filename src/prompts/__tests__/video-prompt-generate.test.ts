import { describe, it, expect } from "vitest";
import {
  videoPromptGeneratePrompt,
  videoPromptGenerateKlingPrompt,
  videoPromptGeneratePromptFor,
} from "../video-prompt-generate";

describe("videoPromptGeneratePrompt (Veo)", () => {
  it("is a versioned, evaluable record", () => {
    expect(videoPromptGeneratePrompt.id).toBe("video-prompt-generate");
    expect(videoPromptGeneratePrompt.version).toBeGreaterThanOrEqual(1);
    expect(videoPromptGeneratePrompt.system.length).toBeGreaterThan(100);
  });

  it("instructs no scene re-description and keeps hype-word hygiene", () => {
    expect(videoPromptGeneratePrompt.system.toLowerCase()).toContain("do not re-describe");
    expect(videoPromptGeneratePrompt.system).toContain("cinematic masterpiece");
  });
});

describe("videoPromptGeneratePromptFor", () => {
  it("returns the Veo record for veo", () => {
    expect(videoPromptGeneratePromptFor("veo").id).toBe("video-prompt-generate");
  });
  it("returns the Kling record for kling", () => {
    expect(videoPromptGeneratePromptFor("kling").id).toBe("video-prompt-generate-kling");
  });
});

describe("videoPromptGenerateKlingPrompt", () => {
  it("keeps camera IN the text (not camera-silent) and shares the i2v grounding", () => {
    const sys = videoPromptGenerateKlingPrompt.system;
    expect(sys.toLowerCase()).toContain("camera movement");
    expect(sys).not.toMatch(/do\s+NOT describe any camera/i);
    expect(sys.toLowerCase()).toContain("do not re-describe");
  });
  it("permits a trailing cinematic quality tag", () => {
    expect(videoPromptGenerateKlingPrompt.system.toLowerCase()).toContain("quality tag");
  });
});
