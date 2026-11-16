import { describe, expect, it } from "vitest";
import { adoptServerKb, changedFields, kbRevision } from "../review-sync";
import { kbWith, withImageAnalysis } from "./fixtures";

const paths = (patches: ReturnType<typeof changedFields>) => patches.map((p) => p.path.join("."));

describe("kbRevision", () => {
  it("changes when any document field changes, and not for Image Analysis", () => {
    expect(kbRevision(kbWith({}))).toBe(kbRevision(kbWith({})));
    expect(kbRevision(kbWith({ "brand_profile.tagline": { status: "approved" } }))).not.toBe(kbRevision(kbWith({})));
    expect(kbRevision(kbWith({ "creative_direction.video.pacing": { value: "slow" } }))).not.toBe(kbRevision(kbWith({})));
    expect(kbRevision(withImageAnalysis(kbWith({}), { aesthetic: { value: "new" } }))).toBe(kbRevision(kbWith({})));
  });
});

describe("changedFields", () => {
  it("finds only the fields the person changed, Image Analysis included", () => {
    const saved = kbWith({});
    const draft = withImageAnalysis(
      kbWith({ "brand_profile.tagline": { status: "approved" }, "target_audience.age_range": { value: "30 to 45", status: "edited" } }),
      { aesthetic: { status: "rejected" } },
    );
    const patches = changedFields(draft, saved);
    expect(paths(patches).sort()).toEqual(["brand_profile.tagline", "image_analysis.aesthetic", "target_audience.age_range"]);
    expect(patches.find((p) => p.path.join(".") === "target_audience.age_range")?.patch)
      .toEqual({ value: "30 to 45", status: "edited", confidence: "high", evidence_type: "explicit" });
    expect(changedFields(saved, saved)).toEqual([]);
  });

  it("sends a field the stored KB did not have yet as a whole field", () => {
    const saved = kbWith({});
    delete (saved.compliance as Record<string, unknown>).content_rules;
    const draft = kbWith({ "compliance.content_rules": { value: "No medical claims.", status: "edited" } });
    expect(changedFields(draft, saved)).toEqual([
      { path: ["compliance", "content_rules"], patch: { value: "No medical claims.", status: "edited", confidence: "high", evidence_type: "explicit" } },
    ]);
  });
});

describe("adoptServerKb", () => {
  it("takes the server's fields into both copies and keeps what the person has not saved yet", () => {
    const saved = kbWith({});
    const draft = kbWith({ "brand_profile.tagline": { status: "approved" } });
    const server = kbWith({
      "target_audience.age_range": { value: "30 to 45", status: "edited" },
      "brand_profile.tagline": { value: "new line", status: "edited" },
    });
    const next = adoptServerKb(draft, saved, server);
    expect(next.draft.target_audience.age_range).toMatchObject({ value: "30 to 45", status: "edited" });
    expect(next.draft.brand_profile.tagline).toMatchObject({ value: "x", status: "approved" });
    expect(next.saved.brand_profile.tagline.value).toBe("new line");
    expect(paths(changedFields(next.draft, next.saved))).toEqual(["brand_profile.tagline"]);
    expect(next.draft.image_analysis).toBe(draft.image_analysis);
    expect(next.saved.image_analysis).toBe(saved.image_analysis);
  });

  it("leaves a clean draft equal to the server's copy", () => {
    const saved = kbWith({});
    const server = kbWith({ "creative_direction.image.feel": { status: "approved" } });
    const next = adoptServerKb(saved, saved, server);
    expect(changedFields(next.draft, next.saved)).toEqual([]);
    expect(next.draft.creative_direction.image.feel.status).toBe("approved");
  });
});
