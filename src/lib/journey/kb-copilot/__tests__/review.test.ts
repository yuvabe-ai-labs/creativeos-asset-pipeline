import { describe, expect, it } from "vitest";
import { kbWith } from "@/lib/kb/__tests__/fixtures";
import { fieldKind, isEmpty, reviewAccount, reviewFields, unreviewedByModule, unsettled } from "../review";

describe("reviewFields", () => {
  it("lists the 43 fields of the six document sections and none of Image Analysis", () => {
    const fields = reviewFields(kbWith({}));
    expect(fields).toHaveLength(43);
    expect(fields.some((f) => f.path.startsWith("image_analysis"))).toBe(false);
    expect(fields.find((f) => f.path === "target_audience.age_range")).toMatchObject({
      module: "audience_casting", label: "Age Range", title: "Audience & Casting · Age Range", kind: "text", value: "x", inferred: false, status: "needs_review",
    });
    expect(fields.find((f) => f.path === "creative_direction.video.pacing")?.module).toBe("video_direction");
  });
});

describe("fieldKind", () => {
  it("knows a list from a text field by the schema, even when empty", () => {
    expect(fieldKind("target_audience.pain_points")).toBe("list");
    expect(fieldKind("compliance.content_rules")).toBe("text");
    expect(fieldKind("creative_direction.image.feel")).toBe("text");
    expect(fieldKind("image_analysis.aesthetic")).toBeNull();
    expect(fieldKind("brand")).toBeNull();
    expect(fieldKind("target_audience.nope")).toBeNull();
  });
});

describe("isEmpty", () => {
  it("is true for nothing, blank text and an empty list", () => {
    expect([null, "", "  ", []].map(isEmpty)).toEqual([true, true, true, true]);
    expect(["x", ["x"]].map(isEmpty)).toEqual([false, false]);
  });
});

describe("unsettled", () => {
  it("asks only about unreviewed fields that are inferred or empty, the ones scripts lean on first", () => {
    const kb = kbWith({
      "brand_profile.tagline": { evidence_type: "inferred" },
      "target_audience.age_range": { evidence_type: "inferred" },
      "compliance.content_rules": { value: null },
      "brand_profile.mission": { evidence_type: "inferred", status: "approved" },
    });
    expect(unsettled(reviewFields(kb)).map((f) => f.path)).toEqual(["compliance.content_rules", "target_audience.age_range", "brand_profile.tagline"]);
  });
});

describe("reviewAccount", () => {
  it("counts what it filled, inferred and could not find", () => {
    const kb = kbWith({
      "brand_profile.tagline": { evidence_type: "inferred" },
      "compliance.disclaimers": { value: [] },
      "compliance.content_rules": { value: null, evidence_type: "inferred" },
    });
    expect(reviewAccount(reviewFields(kb))).toEqual({ total: 43, filled: 41, inferred: 1, empty: 2 });
  });
});

describe("unreviewedByModule", () => {
  it("groups unreviewed paths by tab, in tab order", () => {
    expect(unreviewedByModule(["compliance.disclaimers", "brand_profile.tagline", "brand_profile.mission", "creative_direction.video.pacing"])).toEqual([
      { module: "brand_voice", label: "Brand Voice", count: 2 },
      { module: "video_direction", label: "Video Direction", count: 1 },
      { module: "compliance", label: "Compliance Rules", count: 1 },
    ]);
  });
});
