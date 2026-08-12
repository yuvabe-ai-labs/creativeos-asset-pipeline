import { describe, it, expect } from "vitest";
import { buildVeoConfig } from "../providers/veo";

describe("buildVeoConfig", () => {
  const base = { aspect_ratio: "16:9", duration: "6" };

  it("includes negativePrompt when non-empty (trimmed)", () => {
    const cfg = buildVeoConfig({ ...base, negative_prompt: "  blurry, watermark  " });
    expect(cfg.negativePrompt).toBe("blurry, watermark");
  });

  it("omits negativePrompt when empty, whitespace, or absent", () => {
    expect("negativePrompt" in buildVeoConfig({ ...base, negative_prompt: "" })).toBe(false);
    expect("negativePrompt" in buildVeoConfig({ ...base, negative_prompt: "   " })).toBe(false);
    expect("negativePrompt" in buildVeoConfig(base)).toBe(false);
  });

  it("never sets enhancePrompt (Veo's built-in rewriter stays at its default)", () => {
    expect("enhancePrompt" in buildVeoConfig({ ...base, negative_prompt: "x" })).toBe(false);
  });

  it("clamps invalid durations to 6 and passes 4/6/8 through", () => {
    expect(buildVeoConfig({ ...base, duration: "7" }).durationSeconds).toBe(6);
    expect(buildVeoConfig({ ...base, duration: "4" }).durationSeconds).toBe(4);
    expect(buildVeoConfig({ ...base, duration: "8" }).durationSeconds).toBe(8);
  });

  it("defaults aspectRatio to 16:9 and always requests one video", () => {
    const cfg = buildVeoConfig({ duration: "6" });
    expect(cfg.aspectRatio).toBe("16:9");
    expect(cfg.numberOfVideos).toBe(1);
  });

  it("defaults resolution to 720p when absent", () => {
    expect(buildVeoConfig(base).resolution).toBe("720p");
  });

  it("passes 1080p through when requested", () => {
    expect(buildVeoConfig({ ...base, resolution: "1080p" }).resolution).toBe("1080p");
  });
});
