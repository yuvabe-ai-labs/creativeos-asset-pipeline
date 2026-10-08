import { describe, it, expect } from "vitest";
import { defaultEmptyImageAnalysis, type KBField, type KBFieldStatus } from "@/lib/kb/schema";
import { mergeImageAnalysis } from "./merge";

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
