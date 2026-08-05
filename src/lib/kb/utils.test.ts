import { describe, it, expect } from "vitest";
import { findNextModuleNeedingReview } from "./utils";
import type { ModuleKey } from "./types";

// MODULES order (src/lib/kb/constants.ts): brand_voice, visual_identity, image_analysis,
// audience_casting, image_direction, video_direction, compliance.
function allReady(overrides: Partial<Record<ModuleKey, boolean>> = {}): Record<ModuleKey, boolean> {
  return {
    brand_voice: true,
    visual_identity: true,
    image_analysis: true,
    audience_casting: true,
    image_direction: true,
    video_direction: true,
    compliance: true,
    ...overrides,
  };
}

describe("findNextModuleNeedingReview", () => {
  it("returns the immediate next module when it still needs review", () => {
    const ready = allReady({ image_analysis: false });
    expect(findNextModuleNeedingReview("visual_identity", ready)).toBe("image_analysis");
  });

  it("skips already-ready modules to find the next one that needs review", () => {
    const ready = allReady({ audience_casting: false });
    expect(findNextModuleNeedingReview("visual_identity", ready)).toBe("audience_casting");
  });

  it("wraps around past the end of the list", () => {
    const ready = allReady({ brand_voice: false });
    expect(findNextModuleNeedingReview("compliance", ready)).toBe("brand_voice");
  });

  it("returns null when every module is ready", () => {
    expect(findNextModuleNeedingReview("visual_identity", allReady())).toBeNull();
  });

  it("wraps all the way back to the current module if it's the only one not ready", () => {
    const ready = allReady({ brand_voice: false });
    expect(findNextModuleNeedingReview("brand_voice", ready)).toBe("brand_voice");
  });
});
