import { describe, it, expect } from "vitest";
import { fieldLocation, findNextModuleNeedingReview, getModuleFields, isListField, parseColour } from "./utils";

// Final review, Important 4: an empty field was edited as a comma-split list, which turned typed
// Content Rules prose into a list and broke "10,000" into "10, 000".
describe("isListField", () => {
  it("edits Content Rules as prose even while it is empty", () => {
    expect(isListField("content_rules", null)).toBe(false);
    expect(isListField("content_rules", "Sells flats.")).toBe(false);
  });

  it("keeps list fields lists, empty or not", () => {
    expect(isListField("never_use_words", null)).toBe(true);
    expect(isListField("never_use_words", ["cure"])).toBe(true);
    expect(isListField("tagline", "Home, at last")).toBe(false);
  });
});
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

  it("shows Content Rules first in Compliance, even on an old KB that has none", () => {
    const field = { value: ["heal"], confidence: "high", evidence_type: "explicit", status: "approved" };
    const kb = { compliance: { never_use_words: field } } as unknown as TraceableBrandKB;
    const fields = getModuleFields(kb, "compliance");
    expect(Object.keys(fields)).toEqual(["content_rules", "never_use_words"]);
    expect(fields.content_rules.value).toBeNull();
    // Display only: the stored KB is not changed.
    expect("content_rules" in kb.compliance).toBe(false);
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

describe("fieldLocation (D520)", () => {
  it("finds the tab and key of a review path", () => {
    expect(fieldLocation("creative_direction.video.pacing")).toEqual({ module: "video_direction", fieldKey: "pacing" });
    expect(fieldLocation("brand_profile.tone_of_voice")).toEqual({ module: "brand_voice", fieldKey: "tone_of_voice" });
    expect(fieldLocation("target_audience.age_range")).toEqual({ module: "audience_casting", fieldKey: "age_range" });
  });

  it("is null for a path no tab shows", () => {
    expect(fieldLocation("nope.x")).toBeNull();
    expect(fieldLocation("image_analysis.aesthetic")).toBeNull();
    expect(fieldLocation("brand_profile")).toBeNull();
  });
});
