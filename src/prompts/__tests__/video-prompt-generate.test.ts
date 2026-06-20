import { describe, it, expect } from "vitest";
import { videoPromptGeneratePrompt } from "../video-prompt-generate";

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
