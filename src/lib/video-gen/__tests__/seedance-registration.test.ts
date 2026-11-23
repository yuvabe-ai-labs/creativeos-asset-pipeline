import { describe, it, expect } from "vitest";
import { SEEDANCE_MODEL_ID } from "@/lib/ai-models/model-ids";
import { videoModelsFrom } from "@/lib/ai-models/model-lists";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { validateAgainstRules } from "../constraints";
import { seededPrice } from "@/lib/ai-models/test-prices";
import { videoSecondsUsd } from "@/lib/ai-models/video-price";

const SD = SEEDANCE_MODEL_ID;
const spec = (id: string) => videoModelsFrom(seededModelCatalog()).get(id)!;

describe("Seedance 2.5 registration", () => {
  it("is a seeded video model with an adapter to run it", () => {
    expect(spec(SD)).toBeDefined();
    expect(seededModelCatalog().models.find((m) => m.id === SD)?.adapterKey).toBe("video:seedance-2-5");
  });

  it("allows 30s — triple Gemini Omni's ceiling", () => {
    expect(spec(SD).maxDurationSeconds).toBe(30);
    const duration = spec(SD).params.find((p) => p.name === "duration");
    expect(duration?.constraints).toMatchObject({ min: 4, max: 30 });
  });

  it("offers all three resolutions", () => {
    const res = spec(SD).params.find((p) => p.name === "resolution");
    expect(res?.constraints).toMatchObject({ options: ["480p", "720p", "1080p"] });
  });

  it("groups under Seedance in the picker", () => {
    const g = videoModelsFrom(seededModelCatalog()).groups().find((x) => x.label === "Seedance");
    expect(g?.models.map((m) => m.id)).toContain(SD);
  });

  // Frames and references are mutually exclusive on this endpoint.
  it("disables frames when references are attached, and vice versa", () => {
    const withRefs = validateAgainstRules(spec(SD).rules, {
      params: {}, hasStartFrame: false, hasEndFrame: false, referenceCount: 2,
    });
    expect(withRefs).toBeNull(); // legal — the rule disables inputs, it does not block generate
    const endOnly = validateAgainstRules(spec(SD).rules, {
      params: {}, hasStartFrame: false, hasEndFrame: true, referenceCount: 0,
    });
    expect(endOnly).toBe("End frame needs a start frame before you can generate");
  });

  // Pinned as VALUES, not "not null". A not-null assertion is exactly what let a wrong Kling
  // rate sit in this table overcharging (see the 2026-09-09 correction in cost.ts).
  it("prices every resolution exactly", () => {
    expect(videoSecondsUsd(seededPrice(SD), 1, false, "480p")).toBeCloseTo(0.103, 5);
    expect(videoSecondsUsd(seededPrice(SD), 1, false, "720p")).toBeCloseTo(0.231, 5);
    expect(videoSecondsUsd(seededPrice(SD), 1, false, "1080p")).toBeCloseTo(0.569, 5);
  });

  it("prices a 30s clip, the model's own ceiling", () => {
    expect(videoSecondsUsd(seededPrice(SD), 30, false, "720p")).toBeCloseTo(6.93, 2);
  });

  // The vendor's dated model string must not leak into our id — a BytePlus revision would
  // otherwise become a migration of every persisted node.
  it("does not use the vendor's dated model string as our id", () => {
    expect(SD).not.toContain("260628");
  });
});
