import { describe, it, expect } from "vitest";
import { buildVeoConfig, composeVeoPrompt } from "../providers/veo";

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

  // Veo 3.1 Lite answers any request carrying the field with
  // 400 INVALID_ARGUMENT — "`negativePrompt` isn't supported by this model".
  // Absent, not empty: an empty string is still the field being present.
  it("omits negativePrompt entirely when the model does not support it", () => {
    const cfg = buildVeoConfig(
      { ...base, negative_prompt: "blurry, watermark" },
      { supportsNegativePrompt: false },
    );
    expect("negativePrompt" in cfg).toBe(false);
  });

  it("keeps sending negativePrompt for models that do support it", () => {
    const cfg = buildVeoConfig(
      { ...base, negative_prompt: "blurry" },
      { supportsNegativePrompt: true },
    );
    expect(cfg.negativePrompt).toBe("blurry");
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

// The suppression list is not discarded on Lite — with no native channel for it, the only place
// left to state it is the prompt.
describe("composeVeoPrompt", () => {
  it("appends the suppression list as its own paragraph", () => {
    expect(composeVeoPrompt("Slow push-in.", "blurry, watermark")).toBe(
      "Slow push-in.\n\nAvoid: blurry, watermark.",
    );
  });

  it("returns the prompt untouched when there is nothing to suppress", () => {
    expect(composeVeoPrompt("Slow push-in.", "")).toBe("Slow push-in.");
    expect(composeVeoPrompt("Slow push-in.", "   ")).toBe("Slow push-in.");
  });

  it("does not double the terminating period", () => {
    expect(composeVeoPrompt("Slow push-in.", "blurry, watermark.")).toBe(
      "Slow push-in.\n\nAvoid: blurry, watermark.",
    );
  });
});
