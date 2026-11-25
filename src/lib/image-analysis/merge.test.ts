import { describe, it, expect } from "vitest";
import { defaultEmptyImageAnalysis, type KBField, type KBFieldStatus } from "@/lib/kb/schema";
import { mergeImageAnalysis, studyImageAnalysis } from "./merge";

const field = <T,>(value: T, status: KBFieldStatus = "needs_review"): KBField<T> => ({
  value,
  confidence: "high",
  evidence_type: "inferred",
  status,
});

const section = (over: Record<string, KBField<unknown>>) => ({ ...defaultEmptyImageAnalysis(), ...over }) as ReturnType<typeof defaultEmptyImageAnalysis>;

describe("mergeImageAnalysis", () => {
  it("takes the newer section when nothing was reviewed", () => {
    const next = section({ aesthetic: field("Clean") });
    expect(mergeImageAnalysis(null, next)).toBe(next);
    expect(mergeImageAnalysis(defaultEmptyImageAnalysis(), next).aesthetic).toEqual(field("Clean"));
  });

  it("always keeps the team's own edits", () => {
    const merged = mergeImageAnalysis(section({ aesthetic: field("Ours", "edited") }), section({ aesthetic: field("New") }));
    expect(merged.aesthetic).toEqual(field("Ours", "edited"));
  });

  it("keeps an approval while the value is the same, and asks again once it changes", () => {
    const reviewed = section({ aesthetic: field("Clean", "approved"), visual_mood: field("Calm", "approved") });
    const merged = mergeImageAnalysis(reviewed, section({ aesthetic: field("Clean"), visual_mood: field("Lively") }));
    expect(merged.aesthetic.status).toBe("approved");
    expect(merged.visual_mood).toEqual(field("Lively", "needs_review"));
  });

  it("keeps a decision on a counted field as its numbers move", () => {
    const reviewed = section({ content_mix: field(["Product shot 40%"], "approved"), dominant_colors: field(["green #2F5D3A"], "rejected") });
    const merged = mergeImageAnalysis(
      reviewed,
      section({ content_mix: field(["Product shot 42%"]), dominant_colors: field(["green #2F5D3A", "cream #F4EEDC"]) }),
    );
    expect(merged.content_mix).toEqual(field(["Product shot 42%"], "approved"));
    expect(merged.dominant_colors.status).toBe("rejected");
  });
});

// ── Piece 2b: a study proposes what it would change in a reviewed field ───────

describe("studyImageAnalysis", () => {
  it("keeps an approved written field the study reads differently, and proposes the new reading", () => {
    const reviewed = section({ aesthetic: field("Earthy", "approved") });
    const { section: stored, proposals } = studyImageAnalysis(reviewed, section({ aesthetic: field("Bold") }));
    expect(stored.aesthetic).toEqual(field("Earthy", "approved"));
    expect(proposals).toEqual([{ key: "aesthetic", value: "Bold" }]);
  });

  it("does the same for a rejected field", () => {
    const { section: stored, proposals } = studyImageAnalysis(section({ subjects: field("People", "rejected") }), section({ subjects: field("Products") }));
    expect(stored.subjects).toEqual(field("People", "rejected"));
    expect(proposals).toEqual([{ key: "subjects", value: "Products" }]);
  });

  it("updates an unreviewed field and proposes nothing", () => {
    const { section: stored, proposals } = studyImageAnalysis(section({ aesthetic: field("Earthy") }), section({ aesthetic: field("Bold") }));
    expect(stored.aesthetic).toEqual(field("Bold"));
    expect(proposals).toEqual([]);
  });

  it("keeps a counted field's review as its numbers move, and proposes nothing", () => {
    const reviewed = section({ dominant_colors: field(["green #2F5D3A"], "approved") });
    const { section: stored, proposals } = studyImageAnalysis(reviewed, section({ dominant_colors: field(["green #2F5D3A", "cream #F4EEDC"]) }));
    expect(stored.dominant_colors).toEqual(field(["green #2F5D3A", "cream #F4EEDC"], "approved"));
    expect(proposals).toEqual([]);
  });

  it("leaves a hand-written field alone and proposes nothing", () => {
    const { section: stored, proposals } = studyImageAnalysis(section({ aesthetic: field("Ours", "edited") }), section({ aesthetic: field("Bold") }));
    expect(stored.aesthetic).toEqual(field("Ours", "edited"));
    expect(proposals).toEqual([]);
  });

  it("proposes nothing when the study says the same", () => {
    const { section: stored, proposals } = studyImageAnalysis(section({ aesthetic: field("Earthy", "approved") }), section({ aesthetic: field(" Earthy ") }));
    expect(stored.aesthetic.status).toBe("approved");
    expect(proposals).toEqual([]);
  });

  it("writes the study as it is when nothing was reviewed before", () => {
    const next = section({ aesthetic: field("Bold") });
    expect(studyImageAnalysis(null, next)).toEqual({ section: next, proposals: [] });
  });
});
