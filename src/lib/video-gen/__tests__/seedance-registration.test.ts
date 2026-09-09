import { describe, it, expect } from "vitest";
import { videoGenRegistry } from "../registry";
import { videoGenClientModelMap, videoGenClientModelGroups, SEEDANCE_MODEL_ID } from "../client-models";
import { validateAgainstRules } from "../constraints";
import { computeVideoCost } from "../cost";

const SD = SEEDANCE_MODEL_ID;

describe("Seedance 2.5 registration", () => {
  it("is present in both the server registry and the client map", () => {
    expect(videoGenRegistry[SD]).toBeDefined();
    expect(videoGenClientModelMap[SD]).toBeDefined();
  });

  // D99-style split: the client copy (client-models.ts) and the server copy (providers/seedance.ts)
  // cannot share one object — client-models.ts is safe for React, providers/seedance.ts is
  // server-only. The API route caps referenceUrls against the CLIENT copy while generate() is
  // built from the SERVER copy, so a drift here silently truncates references on a paid generation.
  it("agrees across both sides on the reference-image cap", () => {
    expect(videoGenClientModelMap[SD].imageInputs.maxReferenceImages).toBe(
      videoGenRegistry[SD].imageInputs.maxReferenceImages,
    );
    expect(videoGenClientModelMap[SD].params).toBe(videoGenRegistry[SD].params);
  });

  it("allows 30s — triple Gemini Omni's ceiling", () => {
    expect(videoGenClientModelMap[SD].maxDurationSeconds).toBe(30);
    const duration = videoGenClientModelMap[SD].params.find((p) => p.name === "duration");
    expect(duration?.constraints).toMatchObject({ min: 4, max: 30 });
  });

  it("offers all three resolutions", () => {
    const res = videoGenClientModelMap[SD].params.find((p) => p.name === "resolution");
    expect(res?.constraints).toMatchObject({ options: ["480p", "720p", "1080p"] });
  });

  it("groups under Seedance in the picker", () => {
    const g = videoGenClientModelGroups.find((x) => x.label === "Seedance");
    expect(g?.models.map((m) => m.id)).toContain(SD);
  });

  // Frames and references are mutually exclusive on this endpoint.
  it("disables frames when references are attached, and vice versa", () => {
    const withRefs = validateAgainstRules(videoGenClientModelMap[SD].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: false, referenceCount: 2,
    });
    expect(withRefs).toBeNull(); // legal — the rule disables inputs, it does not block generate
    const endOnly = validateAgainstRules(videoGenClientModelMap[SD].rules, {
      params: {}, hasStartFrame: false, hasEndFrame: true, referenceCount: 0,
    });
    expect(endOnly).toBe("End frame needs a start frame before you can generate");
  });

  // Pinned as VALUES, not "not null". A not-null assertion is exactly what let a wrong Kling
  // rate sit in this table overcharging (see the 2026-09-09 correction in cost.ts).
  it("prices every resolution exactly", () => {
    expect(computeVideoCost(SD, 1, false, "480p")?.usd).toBeCloseTo(0.103, 5);
    expect(computeVideoCost(SD, 1, false, "720p")?.usd).toBeCloseTo(0.231, 5);
    expect(computeVideoCost(SD, 1, false, "1080p")?.usd).toBeCloseTo(0.569, 5);
  });

  it("prices a 30s clip, the model's own ceiling", () => {
    expect(computeVideoCost(SD, 30, false, "720p")?.usd).toBeCloseTo(6.93, 2);
  });

  // The vendor's dated model string must not leak into our id — a BytePlus revision would
  // otherwise become a migration of every persisted node.
  it("does not use the vendor's dated model string as our id", () => {
    expect(SD).not.toContain("260628");
  });
});
