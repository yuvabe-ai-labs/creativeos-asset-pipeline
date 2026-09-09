import { describe, it, expect } from "vitest";
import { videoGenRegistry } from "../registry";
import { videoGenClientModelMap, videoGenClientModelGroups, KLING_OMNI_MODEL_ID } from "../client-models";
import { validateAgainstRules } from "../constraints";
import { computeVideoCost } from "../cost";
import { buildO1Settings, build30OmniSettings } from "../providers/kling";

const OMNI = KLING_OMNI_MODEL_ID;

describe("Kling 3.0 Omni registration", () => {
  it("is present in both the server registry and the client map", () => {
    expect(videoGenRegistry[OMNI]).toBeDefined();
    expect(videoGenClientModelMap[OMNI]).toBeDefined();
  });

  // D99 — unlike Gemini Omni, Kling's two sides deliberately do NOT share one object: the client
  // module cannot import the `server-only` provider. So this asserts the two copies agree on the
  // one value that must, rather than that they are the same reference. The API route caps
  // referenceUrls against the CLIENT copy while the provider is built from the SERVER copy, so a
  // drift here silently truncates references on a paid generation.
  it("agrees across both sides on the reference-image cap", () => {
    expect(videoGenClientModelMap[OMNI].imageInputs.maxReferenceImages).toBe(
      videoGenRegistry[OMNI].imageInputs.maxReferenceImages,
    );
    expect(videoGenClientModelMap[OMNI].params).toBe(videoGenRegistry[OMNI].params);
  });

  it("allows 15s and reference images", () => {
    expect(videoGenClientModelMap[OMNI].maxDurationSeconds).toBe(15);
    expect(videoGenClientModelMap[OMNI].imageInputs.maxReferenceImages).toBeGreaterThan(0);
  });

  it("offers a duration slider covering the full 3-15 range", () => {
    const duration = videoGenClientModelMap[OMNI].params.find((p) => p.name === "duration");
    expect(duration?.component).toBe("slider");
    expect(duration?.constraints).toMatchObject({ min: 3, max: 15 });
  });

  it("groups under Kling in the picker", () => {
    const kling = videoGenClientModelGroups.find((g) => g.label === "Kling");
    expect(kling?.models.map((m) => m.id)).toContain(OMNI);
  });

  // D101 — a refer_image stands alone as an input on the omni endpoints, so references with no
  // start frame is a legal request here (it is not on kling-3-0).
  it("allows a references-only request", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: false, referenceCount: 2,
    });
    expect(violation).toBeNull();
  });

  it("blocks a request with neither a start frame nor a reference", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: false, referenceCount: 0,
    });
    expect(violation).toBe("Kling needs a start frame or at least one reference image");
  });

  // OM7 — an end frame is the destination of an interpolation that has to start somewhere, and a
  // reference does not stand in for that origin.
  it("blocks an end frame with no start frame", () => {
    const violation = validateAgainstRules(videoGenClientModelMap[OMNI].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: true, referenceCount: 3,
    });
    expect(violation).toBe("End frame needs a start frame before you can generate");
  });
});

// The whole reason build30OmniSettings exists rather than reusing buildO1Settings. O1's 5/10
// clamp is runtime evidence about O1's validator; applying it here would rewrite the multishot
// lane's duration — the sum of the operator's cut ladder — down to 5, and Kling rejects a shot
// list whose seconds no longer sum to `duration`.
describe("build30OmniSettings — duration policy", () => {
  it("passes through every integer in the 3-15 range that O1 would have rejected", () => {
    for (const duration of [3, 4, 6, 7, 9, 11, 14, 15]) {
      expect(build30OmniSettings({ duration }).duration).toBe(duration);
    }
  });

  it("clamps outside the range rather than falling back to 5", () => {
    expect(build30OmniSettings({ duration: 2 }).duration).toBe(3);
    expect(build30OmniSettings({ duration: 99 }).duration).toBe(15);
  });

  it("still clamps O1 to 5 or 10, unchanged by the extraction", () => {
    expect(buildO1Settings({ duration: 7 }).duration).toBe(5);
    expect(buildO1Settings({ duration: 10 }).duration).toBe(10);
  });

  // Kling defaults multi_shot to TRUE server-side, so an omitted field silently opts a clip into
  // cuts. Both builders must send it explicitly.
  it("always sends multi_shot explicitly", () => {
    expect(build30OmniSettings({}).multi_shot).toBe(false);
    expect(build30OmniSettings({ multi_shot: true }).multi_shot).toBe(true);
  });

  // OM8 — required when there is no first frame, omitted when there is one (Kling derives it).
  it("sends aspect_ratio only on the references-only path", () => {
    expect(build30OmniSettings({}, { hasStartFrame: true })).not.toHaveProperty("aspect_ratio");
    expect(build30OmniSettings({ aspect_ratio: "9:16" }, { hasStartFrame: false })).toMatchObject({
      aspect_ratio: "9:16",
    });
  });
});

describe("computeVideoCost — Kling 3.0 Omni", () => {
  // Without a row here computeVideoCost returns null and video-generate throws "No cost estimate
  // available" before ever reaching the provider — an unpriced model looks registered and cannot
  // generate. NOTE: these figures are PROVISIONAL (Kling 3.0's published rates); see cost.ts.
  it("prices every resolution the model offers, with and without audio", () => {
    for (const resolution of ["720p", "1080p", "4k"]) {
      expect(computeVideoCost(OMNI, 5, false, resolution)).not.toBeNull();
      expect(computeVideoCost(OMNI, 5, true, resolution)).not.toBeNull();
    }
  });

  it("scales linearly with duration", () => {
    const one = computeVideoCost(OMNI, 1, false, "720p")!.usd;
    expect(computeVideoCost(OMNI, 10, false, "720p")!.usd).toBeCloseTo(one * 10, 5);
  });
});
