import { describe, it, expect } from "vitest";
import { videoGenRegistry } from "../registry";
import { videoGenClientModelMap, GEMINI_OMNI_11_MODEL_ID, GEMINI_OMNI_12_MODEL_ID } from "../client-models";
import { validateAgainstRules } from "../constraints";
import { computeVideoCost, OMNI_11_REROUTE_AT, pricedVideoModelId } from "../cost";

const OMNI_11 = GEMINI_OMNI_11_MODEL_ID;
const OMNI_12 = GEMINI_OMNI_12_MODEL_ID;
const BEFORE_REROUTE = new Date("2026-11-10T00:00:00Z");
const AFTER_REROUTE = new Date("2026-12-04T00:00:00Z");

describe.each([OMNI_11, OMNI_12])("Gemini Omni registration — %s", (OMNI) => {
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
      params: { duration: 8 }, hasStartFrame: true, hasEndFrame: true, referenceCount: 3,
    });
    expect(violation).toBeNull();
  });

  // Omni generates audio on every request and the rate already includes it, so unlike Kling the
  // audio flag must not move the price in either direction.
  it("charges the same whether audio is flagged on or off", () => {
    expect(computeVideoCost(OMNI, 8, true, "720p")?.usd)
      .toBe(computeVideoCost(OMNI, 8, false, "720p")?.usd);
  });

  // Strict lookup, no cross-key fallback — an unreachable resolution must not silently bill at
  // the 720p rate.
  it("returns null for a resolution this model does not offer", () => {
    expect(computeVideoCost(OMNI, 8, true, "8k")).toBeNull();
  });
});

describe("Gemini Omni versions (D484)", () => {
  const durationMax = (id: string) => {
    const spec = videoGenClientModelMap[id].params.find((p) => p.name === "duration")!;
    return spec.constraints.type === "slider" ? spec.constraints.max : null;
  };

  it("offers 3–10s on 1.1 and 3–15s on 1.2", () => {
    expect(videoGenClientModelMap[OMNI_11].maxDurationSeconds).toBe(10);
    expect(durationMax(OMNI_11)).toBe(10);
    expect(videoGenClientModelMap[OMNI_12].maxDurationSeconds).toBe(15);
    expect(durationMax(OMNI_12)).toBe(15);
  });

  it("lists 1.2 before 1.1 so the picker shows the current version first", () => {
    const ids = Object.keys(videoGenClientModelMap);
    expect(ids.indexOf(OMNI_12)).toBeLessThan(ids.indexOf(OMNI_11));
  });

  it("caps 1.2 at Google's documented 6 references", () => {
    expect(videoGenClientModelMap[OMNI_12].imageInputs.maxReferenceImages).toBe(6);
  });

  // Google: first + last frame interpolation is 3–10s on 1.2; a longer request is a 400.
  it("blocks a frame pair over 10s on 1.2, and only then", () => {
    const rules = videoGenClientModelMap[OMNI_12].rules;
    const pair = { hasStartFrame: true, hasEndFrame: true, referenceCount: 0 };
    expect(validateAgainstRules(rules, { ...pair, params: { duration: 11 } })).toContain("up to 10s");
    expect(validateAgainstRules(rules, { ...pair, params: { duration: "12" } })).toContain("up to 10s");
    expect(validateAgainstRules(rules, { ...pair, params: { duration: 10 } })).toBeNull();
    expect(validateAgainstRules(rules, { ...pair, hasEndFrame: false, params: { duration: 15 } })).toBeNull();
  });
});

describe("computeVideoCost — Gemini Omni", () => {
  // Google bills output tokens per second of video: 1,931 / 5,792 / 8,688 / 17,376 tokens/s.
  it("prices 1.1 at $17.50 per 1M video tokens before the reroute", () => {
    expect(computeVideoCost(OMNI_11, 1, true, "360p", BEFORE_REROUTE)?.usd).toBeCloseTo(0.0337925, 7);
    expect(computeVideoCost(OMNI_11, 1, true, "720p", BEFORE_REROUTE)?.usd).toBeCloseTo(0.10136, 7);
    expect(computeVideoCost(OMNI_11, 1, true, "1080p", BEFORE_REROUTE)?.usd).toBeCloseTo(0.15204, 7);
    expect(computeVideoCost(OMNI_11, 1, true, "4k", BEFORE_REROUTE)?.usd).toBeCloseTo(0.30408, 7);
  });

  it("prices 1.2 at $12 per 1M video tokens", () => {
    expect(computeVideoCost(OMNI_12, 1, true, "360p")?.usd).toBeCloseTo(0.023172, 7);
    expect(computeVideoCost(OMNI_12, 1, true, "720p")?.usd).toBeCloseTo(0.069504, 7);
    expect(computeVideoCost(OMNI_12, 1, true, "1080p")?.usd).toBeCloseTo(0.104256, 7);
    expect(computeVideoCost(OMNI_12, 1, true, "4k")?.usd).toBeCloseTo(0.208512, 7);
  });

  it("defaults to the 720p rate when no resolution is given", () => {
    expect(computeVideoCost(OMNI_12, 10, true)?.usd).toBeCloseTo(0.69504, 7);
  });

  // From 2026-12-03 Google serves and bills every 1.1 request as 1.2.
  it("prices 1.1 at 1.2 rates from the reroute date", () => {
    expect(pricedVideoModelId(OMNI_11, BEFORE_REROUTE)).toBe(OMNI_11);
    expect(pricedVideoModelId(OMNI_11, OMNI_11_REROUTE_AT)).toBe(OMNI_12);
    expect(computeVideoCost(OMNI_11, 8, true, "720p", AFTER_REROUTE)?.usd)
      .toBe(computeVideoCost(OMNI_12, 8, true, "720p")?.usd);
    expect(pricedVideoModelId("kling:kling-3-0-omni", AFTER_REROUTE)).toBe("kling:kling-3-0-omni");
  });
});
