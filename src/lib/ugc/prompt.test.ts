import { describe, expect, it } from "vitest";
import { buildSeedancePrompt } from "./prompt";
import { DEFAULT_SETTINGS } from "./constants";

describe("buildSeedancePrompt", () => {
  it("appends settings as --flags after the script", () => {
    const out = buildSeedancePrompt("She holds up the jar.", {
      ...DEFAULT_SETTINGS,
      resolution: "720p",
      duration: 5,
      ratio: "9:16",
    });
    expect(out).toBe(
      "She holds up the jar. --resolution 720p --duration 5 --ratio 9:16 --watermark false",
    );
  });

  it("trims the script", () => {
    expect(buildSeedancePrompt("  hi  ", DEFAULT_SETTINGS).startsWith("hi --")).toBe(true);
  });
});
