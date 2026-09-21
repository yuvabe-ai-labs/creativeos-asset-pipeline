import { describe, it, expect } from "vitest";
import { videoGenRegistry } from "../registry";
import { videoGenClientModelMap } from "../client-models";
import { validateAgainstRules } from "../constraints";
import { computeVideoCost } from "../cost";

const OMNI = "gemini:gemini-omni-1.1-flash";

describe("Gemini Omni registration", () => {
  it("is present in both the server registry and the client map", () => {
    expect(videoGenRegistry[OMNI]).toBeDefined();
    expect(videoGenClientModelMap[OMNI]).toBeDefined();
  });

  // The API route caps referenceUrls against the CLIENT copy while the provider is built from the
  // SERVER copy. Both now read one shared module, so this asserts they stayed wired to it.
  it("shares one identical imageInputs, params and rules object across both sides", () => {
    expect(videoGenClientModelMap[OMNI].imageInputs).toBe(videoGenRegistry[OMNI].imageInputs);
    expect(videoGenClientModelMap[OMNI].params).toBe(videoGenRegistry[OMNI].params);
    expect(videoGenClientModelMap[OMNI].rules).toBe(videoGenRegistry[OMNI].rules);
  });

  it("blocks an end frame with no start frame", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: true, referenceCount: 0,
    });
    expect(violation).toBe("End frame needs a start frame — <LAST_FRAME> requires <FIRST_FRAME>");
  });

  // Unlike Veo, references and frames coexist on this model — no rule may fire here.
  it("allows a start frame, an end frame and references together", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: true, hasEndFrame: true, referenceCount: 3,
    });
    expect(violation).toBeNull();
  });
});

describe("computeVideoCost — Gemini Omni", () => {
  it("prices all four resolutions per second", () => {
    expect(computeVideoCost(OMNI, 1, true, "360p")?.usd).toBeCloseTo(0.03, 5);
    expect(computeVideoCost(OMNI, 1, true, "720p")?.usd).toBeCloseTo(0.10, 5);
    expect(computeVideoCost(OMNI, 1, true, "1080p")?.usd).toBeCloseTo(0.15, 5);
    expect(computeVideoCost(OMNI, 1, true, "4k")?.usd).toBeCloseTo(0.30, 5);
  });

  // Omni generates audio on every request and the rate already includes it, so unlike Kling the
  // audio flag must not move the price in either direction.
  it("charges the same whether audio is flagged on or off", () => {
    expect(computeVideoCost(OMNI, 8, true, "720p")?.usd)
      .toBe(computeVideoCost(OMNI, 8, false, "720p")?.usd);
  });

  it("defaults to the 720p rate when no resolution is given", () => {
    expect(computeVideoCost(OMNI, 8, true)?.usd).toBeCloseTo(0.80, 5);
  });

  // Strict lookup, no cross-key fallback — an unreachable resolution must not silently bill at
  // the 720p rate.
  it("returns null for a resolution this model does not offer", () => {
    expect(computeVideoCost(OMNI, 8, true, "8k")).toBeNull();
  });
});
