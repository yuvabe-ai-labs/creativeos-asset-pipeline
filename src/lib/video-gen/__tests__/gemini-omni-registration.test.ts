import { describe, it, expect } from "vitest";
import { videoModelsFrom } from "@/lib/ai-models/model-lists";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { GEMINI_OMNI_11_MODEL_ID, GEMINI_OMNI_12_MODEL_ID } from "@/lib/ai-models/model-ids";
import { validateAgainstRules } from "../constraints";
import { seededPrice } from "@/lib/ai-models/test-prices";
import { videoSecondsUsd } from "@/lib/ai-models/video-price";

const OMNI_11 = GEMINI_OMNI_11_MODEL_ID;
const OMNI_12 = GEMINI_OMNI_12_MODEL_ID;
const BEFORE_REROUTE = new Date("2026-11-10T00:00:00Z");
const REROUTE_AT = new Date("2026-12-03T08:00:00Z");
const videos = videoModelsFrom(seededModelCatalog());
const spec = (id: string) => videos.get(id)!;

describe.each([OMNI_11, OMNI_12])("Gemini Omni registration — %s", (OMNI) => {
  it("is a seeded video model with an adapter to run it", () => {
    expect(videos.get(OMNI)).toBeDefined();
    expect(seededModelCatalog().models.find((m) => m.id === OMNI)?.adapterKey).toMatch(/^video:/);
  });

  it("blocks an end frame with no start frame", () => {
    const violation = validateAgainstRules(spec(OMNI).rules, {
      params: {}, hasStartFrame: false, hasEndFrame: true, referenceCount: 0,
    });
    expect(violation).toBe("End frame needs a start frame — <LAST_FRAME> requires <FIRST_FRAME>");
  });

  // Unlike Veo, references and frames coexist on this model — no rule may fire here.
  it("allows a start frame, an end frame and references together", () => {
    const violation = validateAgainstRules(spec(OMNI).rules, {
      params: { duration: 8 }, hasStartFrame: true, hasEndFrame: true, referenceCount: 3,
    });
    expect(violation).toBeNull();
  });

  // Omni generates audio on every request and the rate already includes it, so unlike Kling the
  // audio flag must not move the price in either direction.
  it("charges the same whether audio is flagged on or off", () => {
    expect(videoSecondsUsd(seededPrice(OMNI), 8, true, "720p"))
      .toBe(videoSecondsUsd(seededPrice(OMNI), 8, false, "720p"));
  });

  // Strict lookup, no cross-key fallback — an unreachable resolution must not silently bill at
  // the 720p rate.
  it("returns null for a resolution this model does not offer", () => {
    expect(videoSecondsUsd(seededPrice(OMNI), 8, true, "8k")).toBeNull();
  });
});

describe("Gemini Omni versions (D484)", () => {
  const durationMax = (id: string) => {
    const duration = spec(id).params.find((p) => p.name === "duration")!;
    return duration.constraints.type === "slider" ? duration.constraints.max : null;
  };

  it("offers 3–10s on 1.1 and 3–15s on 1.2", () => {
    expect(spec(OMNI_11).maxDurationSeconds).toBe(10);
    expect(durationMax(OMNI_11)).toBe(10);
    expect(spec(OMNI_12).maxDurationSeconds).toBe(15);
    expect(durationMax(OMNI_12)).toBe(15);
  });

  it("lists 1.2 before 1.1 so the picker shows the current version first", () => {
    const ids = videos.all.map((m) => m.id);
    expect(ids.indexOf(OMNI_12)).toBeLessThan(ids.indexOf(OMNI_11));
  });

  // D494 — measured live: 24 references alone, 9 images in all with frames.
  it("caps 1.2 at its measured 24 references, 9 images with frames", () => {
    expect(spec(OMNI_12).imageInputs.maxReferenceImages).toBe(24);
    expect(spec(OMNI_12).imageInputs.maxImagesWithFrames).toBe(9);
  });

  // Google: first + last frame interpolation is 3–10s on 1.2; a longer request is a 400.
  it("blocks a frame pair over 10s on 1.2, and only then", () => {
    const rules = spec(OMNI_12).rules;
    const pair = { hasStartFrame: true, hasEndFrame: true, referenceCount: 0 };
    expect(validateAgainstRules(rules, { ...pair, params: { duration: 11 } })).toContain("up to 10s");
    expect(validateAgainstRules(rules, { ...pair, params: { duration: "12" } })).toContain("up to 10s");
    expect(validateAgainstRules(rules, { ...pair, params: { duration: 10 } })).toBeNull();
    expect(validateAgainstRules(rules, { ...pair, hasEndFrame: false, params: { duration: 15 } })).toBeNull();
  });
});

describe("Gemini Omni prices (migration 0078)", () => {
  // Google bills output tokens per second of video: 1,931 / 5,792 / 8,688 / 17,376 tokens/s.
  it("prices 1.1 at $17.50 per 1M video tokens before the reroute", () => {
    expect(videoSecondsUsd(seededPrice(OMNI_11, BEFORE_REROUTE), 1, true, "360p")).toBeCloseTo(0.0337925, 7);
    expect(videoSecondsUsd(seededPrice(OMNI_11, BEFORE_REROUTE), 1, true, "720p")).toBeCloseTo(0.10136, 7);
    expect(videoSecondsUsd(seededPrice(OMNI_11, BEFORE_REROUTE), 1, true, "1080p")).toBeCloseTo(0.15204, 7);
    expect(videoSecondsUsd(seededPrice(OMNI_11, BEFORE_REROUTE), 1, true, "4k")).toBeCloseTo(0.30408, 7);
  });

  it("prices 1.2 at $12 per 1M video tokens", () => {
    expect(videoSecondsUsd(seededPrice(OMNI_12), 1, true, "360p")).toBeCloseTo(0.023172, 7);
    expect(videoSecondsUsd(seededPrice(OMNI_12), 1, true, "720p")).toBeCloseTo(0.069504, 7);
    expect(videoSecondsUsd(seededPrice(OMNI_12), 1, true, "1080p")).toBeCloseTo(0.104256, 7);
    expect(videoSecondsUsd(seededPrice(OMNI_12), 1, true, "4k")).toBeCloseTo(0.208512, 7);
  });

  it("defaults to the 720p rate when no resolution is given", () => {
    expect(videoSecondsUsd(seededPrice(OMNI_12), 10, true, undefined)).toBeCloseTo(0.69504, 7);
  });

  // From 2026-12-03 Google serves and bills every 1.1 request as 1.2.
  it("prices 1.1 at 1.2 rates from the reroute date", () => {
    expect(seededPrice(OMNI_11, REROUTE_AT).lines).toEqual(seededPrice(OMNI_12).lines);
    expect(seededPrice(OMNI_11, BEFORE_REROUTE).lines).not.toEqual(seededPrice(OMNI_12).lines);
  });
});
