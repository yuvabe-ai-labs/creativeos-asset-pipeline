import { describe, it, expect } from "vitest";
import { withHouseRulesMoved } from "../move-house-rules";
import type { TraceableBrandKB } from "../schema";

const field = (value: unknown, status = "approved") => ({ value, confidence: "high", evidence_type: "explicit", status });
const kbWith = (notes: unknown, rules?: unknown) => ({
  compliance: rules === undefined ? { never_use_words: field(["cure"]) } : { never_use_words: field(["cure"]), content_rules: field(rules) },
  image_analysis: { brand_consistency_notes: field(notes) },
}) as unknown as TraceableBrandKB;

describe("withHouseRulesMoved", () => {
  it("copies pasted house rules into an empty Content Rules, marked edited, and leaves the notes alone", () => {
    const { kb, moved } = withHouseRulesMoved(kbWith("HOUSE SPEC: locked lines…", null));
    expect(moved).toBe(true);
    expect(kb.compliance.content_rules).toEqual({ value: "HOUSE SPEC: locked lines…", confidence: "high", evidence_type: "explicit", status: "edited" });
    expect(kb.image_analysis.brand_consistency_notes.value).toBe("HOUSE SPEC: locked lines…");
  });

  it("works on a KB saved before Content Rules existed", () => {
    expect(withHouseRulesMoved(kbWith("HOUSE SPEC")).kb.compliance.content_rules?.value).toBe("HOUSE SPEC");
  });

  it("never overwrites Content Rules someone already wrote", () => {
    const { kb, moved } = withHouseRulesMoved(kbWith("HOUSE SPEC", "Sells flats."));
    expect(moved).toBe(false);
    expect(kb.compliance.content_rules?.value).toBe("Sells flats.");
  });

  it("moves nothing when there are no notes", () => {
    expect(withHouseRulesMoved(kbWith(null, null)).moved).toBe(false);
  });
});
