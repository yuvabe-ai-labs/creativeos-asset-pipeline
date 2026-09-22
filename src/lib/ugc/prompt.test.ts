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

  it("with a voice anchor, binds @Image 1 and @Audio 1 and adds the voice note", () => {
    const out = buildSeedancePrompt("She says hi.", DEFAULT_SETTINGS, { note: "warm, upbeat" });
    expect(out.startsWith(
      "Use the person in @Image 1 as the creator. Reference only the voice timbre in @Audio 1 " +
        "(not its music or sound effects). Voice: warm, upbeat. She says hi. --resolution",
    )).toBe(true);
  });

  it("with a voice anchor and no note, omits the Voice: clause", () => {
    const out = buildSeedancePrompt("Hi.", DEFAULT_SETTINGS, { note: "  " });
    expect(out).toContain("sound effects). Hi. --");
    expect(out).not.toContain("Voice:");
  });
});
