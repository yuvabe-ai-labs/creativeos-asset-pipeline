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

  // Audio is off by default and costs real money to turn on (+33% at 720p, +25% at 1080p —
  // cost.ts), so it must be a control the operator sets deliberately, not a value they inherit.
  it("offers audio as an operator-settable param, defaulting to off", () => {
    const audio = videoGenClientModelMap[OMNI].params.find((p) => p.name === "audio");
    expect(audio?.defaultValue).toBe("off");
    expect(audio?.visible).toBe(true);
    expect(audio?.constraints).toMatchObject({ options: ["native", "off"] });
  });
});

// This bug shipped once and was invisible for exactly this reason: `audio` was declared, sent on
// every request and priced into every estimate, but its group stopped rendering when the Advanced
// section was deleted in 7e1c643 — so a Kling clip could only ever come back silent, with nothing
// failing anywhere. A param the panel never draws is not a param the operator has.
describe("every visible param is reachable in some rendered group", () => {
  // The groups video-gen-focus-view.tsx actually renders. If a param is declared in a group that
  // is not in this list, it exists in the request and nowhere on screen.
  const RENDERED_GROUPS = ["primary", "advanced"];

  for (const modelId of Object.keys(videoGenClientModelMap)) {
    it(`${modelId}`, () => {
      const orphaned = videoGenClientModelMap[modelId].params
        .filter((p) => p.visible && !RENDERED_GROUPS.includes(p.group))
        .map((p) => `${p.name} (group: ${p.group})`);
      expect(orphaned).toEqual([]);
    });
  }

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

  // A node saved before this param existed still holds whatever it held, and nothing
  // re-validates persisted params on load. An arithmetic clamp propagates NaN where O1's
  // `includes()` clamp rejected it for free — that would serialize as `"duration": null` and
  // earn a 400 minutes into a queued generation.
  it("falls back to the default for a non-numeric persisted duration", () => {
    expect(build30OmniSettings({ duration: "not a number" }).duration).toBe(5);
    expect(build30OmniSettings({ duration: null }).duration).toBe(5);
    expect(build30OmniSettings({}).duration).toBe(5);
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
  // generate.
  it("prices every resolution the model offers, with and without audio", () => {
    for (const resolution of ["720p", "1080p", "4k"]) {
      expect(computeVideoCost(OMNI, 5, false, resolution)).not.toBeNull();
      expect(computeVideoCost(OMNI, 5, true, resolution)).not.toBeNull();
    }
  });

  // The exact published per-second rates (kling.ai/document-api/pricing/base/video, "No Video
  // Input" — the only tier this app can produce, since buildKlingContents never sends a video).
  //
  // Pinned as VALUES, not merely as "not null". The row shipped provisionally with 3.0's rates
  // borrowed, and a not-null assertion is exactly what let a wrong audio delta sit there
  // overcharging: 0.126 where the real figure is 0.112, and 0.168 where it is 0.14. A test that
  // only asks whether a price exists cannot catch a price that is wrong.
  it("matches the published per-second rates exactly", () => {
    expect(computeVideoCost(OMNI, 1, false, "720p")?.usd).toBeCloseTo(0.084, 5);
    expect(computeVideoCost(OMNI, 1, true, "720p")?.usd).toBeCloseTo(0.112, 5);
    expect(computeVideoCost(OMNI, 1, false, "1080p")?.usd).toBeCloseTo(0.112, 5);
    expect(computeVideoCost(OMNI, 1, true, "1080p")?.usd).toBeCloseTo(0.14, 5);
    expect(computeVideoCost(OMNI, 1, false, "4k")?.usd).toBeCloseTo(0.42, 5);
    expect(computeVideoCost(OMNI, 1, true, "4k")?.usd).toBeCloseTo(0.42, 5);
  });

  // The audio delta is +33% at 720p and +25% at 1080p — NOT the +50% Kling 3.0 carries, which is
  // what the provisional row assumed. Stated as its own case because that assumption is the one
  // that was wrong, and a future edit that "restores consistency" with 3.0 would reintroduce it.
  it("does not charge Kling 3.0's +50% audio delta", () => {
    const off720 = computeVideoCost(OMNI, 1, false, "720p")!.usd;
    const on720 = computeVideoCost(OMNI, 1, true, "720p")!.usd;
    expect(on720).toBeLessThan(off720 * 1.5);
    expect(on720 / off720).toBeCloseTo(4 / 3, 3);
  });

  it("scales linearly with duration", () => {
    const one = computeVideoCost(OMNI, 1, false, "720p")!.usd;
    expect(computeVideoCost(OMNI, 10, false, "720p")!.usd).toBeCloseTo(one * 10, 5);
  });
});
