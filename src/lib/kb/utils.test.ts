import { describe, it, expect } from "vitest";
import { findNextModuleNeedingReview, getModuleFields, parseColour } from "./utils";
import type { TraceableBrandKB } from "./schema";
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

describe("parseColour", () => {
  it("splits a name from its hex and normalises the hex", () => {
    expect(parseColour("turmeric gold #c8a000")).toEqual({ name: "turmeric gold", hex: "#C8A000" });
    expect(parseColour("#fff")).toEqual({ name: "", hex: "#FFFFFF" });
    expect(parseColour("Coca-Cola Red: #F40009")).toEqual({ name: "Coca-Cola Red", hex: "#F40009" });
  });

  it("keeps a name with no hex as it is", () => {
    expect(parseColour("navy")).toEqual({ name: "navy", hex: null });
  });
});

describe("getModuleFields", () => {
  it("leads Visual Identity with the palette, whatever order the KB was stored in", () => {
    const field = { value: null, confidence: "low", evidence_type: "inferred", status: "needs_review" };
    const kb = {
      visual_identity: {
        aesthetic: field,
        photography_style: field,
        colour_palette_avoid: field,
        colour_palette_primary: field,
        lighting: field,
        colour_palette_secondary: field,
      },
    } as unknown as TraceableBrandKB;
    expect(Object.keys(getModuleFields(kb, "visual_identity"))).toEqual([
      "colour_palette_primary",
      "colour_palette_secondary",
      "colour_palette_avoid",
      "aesthetic",
      "photography_style",
      "lighting",
    ]);
  });
});

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
