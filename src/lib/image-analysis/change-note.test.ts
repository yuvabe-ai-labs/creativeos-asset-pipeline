import { describe, expect, it } from "vitest";
import { defaultEmptyImageAnalysis, type TraceableBrandKB } from "@/lib/kb/schema";
import { changedImageFields, imageAnalysisNote } from "./change-note";

type Section = TraceableBrandKB["image_analysis"];
const section = (over: Record<string, unknown>): Section => {
  const s = defaultEmptyImageAnalysis() as unknown as Record<string, { value: unknown }>;
  for (const [k, v] of Object.entries(over)) s[k] = { ...s[k], value: v };
  return s as unknown as Section;
};

describe("changedImageFields", () => {
  it("names each field whose value a re-study changed, by its label, in screen order", () => {
    const before = section({ visual_mood: "Calm", dominant_colors: ["green"] });
    const after = section({ visual_mood: "Bold", dominant_colors: ["green"], content_mix: "Mostly video" });
    expect(changedImageFields(before, after)).toEqual(["Format Mix", "Visual Mood"]);
  });
  it("ignores list order", () => {
    expect(changedImageFields(section({ dominant_colors: ["a", "b"] }), section({ dominant_colors: ["b", "a"] }))).toEqual([]);
  });
});

describe("imageAnalysisNote", () => {
  it("says which fields changed", () => {
    expect(imageAnalysisNote(["Visual Mood", "Dominant Colours"])).toBe("Studied the images again. Changed: Visual Mood, Dominant Colours.");
  });
  it("says nothing when nothing changed", () => {
    expect(imageAnalysisNote([])).toBeNull();
  });
});
