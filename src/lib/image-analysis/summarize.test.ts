import { describe, it, expect } from "vitest";
import { aggregateCards, buildSummaryInput, toImageAnalysis, type ImageSummary } from "./summarize";
import type { CardEntry } from "./aggregate";
import type { ImageCard } from "./card-schema";

const card = (over: Partial<ImageCard> = {}): ImageCard => ({
  format: "product_shot",
  purpose: "promote",
  summary: "Flour pack on cream",
  subjects: ["flour pack"],
  product: { visible: true, presentation: "packshot" },
  setting: "studio",
  background: "plain",
  background_note: "cream backdrop",
  composition: { shot_type: "close_up", angle: "eye_level", framing: "centred" },
  lighting: "studio",
  lighting_note: "soft and even",
  colours: [{ name: "forest green", hex: "#2F5D3A", share: 60 }],
  mood: ["wholesome"],
  style_tags: ["clean"],
  people: { count: 0, description: null },
  text_overlay: { present: false, text: null, font_style: null, font_note: null, colours_hex: [], placement: null, treatment: null },
  logo_visible: true,
  polish: "professional",
  ...over,
});

const SUMMARY: ImageSummary = {
  aesthetic: "Clean and natural",
  visual_mood: "Wholesome",
  subjects: "Flour packs",
  product_presentation: "Packshots on cream",
  composition_style: "Centred close-ups",
  lighting_character: "Soft studio light",
  settings_backgrounds: "Plain cream backdrops",
  people_casting: "No people appear",
  text_overlay_style: "Rarely used",
  recurring_motifs: ["steel bowls"],
  brand_consistency_notes: "Consistent across sources",
};

describe("buildSummaryInput", () => {
  const entries: CardEntry[] = [
    { source: "instagram", card: card({ summary: "Reel cover" }) },
    { source: "upload", card: card({ summary: "Hero packshot" }) },
    { source: "website", card: card({ format: "third_party_or_ui", summary: "Retailer badge" }) },
  ];
  const text = buildSummaryInput(aggregateCards(entries), entries);

  it("states the exact tallies", () => {
    expect(text).toContain("Brand images counted: 2 (uploads 1, website 0, instagram 1, facebook 0); 1 third-party");
    expect(text).toContain("Format mix (what the images look like): Product shot 100%.");
    expect(text).toContain("Purpose mix (why they were posted): Promote 100%.");
    expect(text).toContain("Shot type: close up 100%. Angle: eye level 100%. Framing: centred 100%.");
    expect(text).toContain("Lighting: studio 100%. Background: plain 100%.");
  });

  it("gives each card its fixed values with the notes behind them", () => {
    expect(text).toContain("plain (cream backdrop)");
    expect(text).toContain("studio: soft and even");
  });

  it("says when the cards are a sample of a larger set", () => {
    const big = Array.from({ length: 1200 }, () => ({ source: "instagram" as const, card: card() }));
    const input = buildSummaryInput(aggregateCards(big), big);
    expect(input).toContain("Cards 1000 of 1200, a sample that keeps the mix; the figures above count all 1200");
    expect(text).not.toContain("a sample");
  });

  it("lists uploads first and leaves third-party images out", () => {
    expect(text.indexOf("Hero packshot")).toBeLessThan(text.indexOf("Reel cover"));
    expect(text).not.toContain("Retailer badge");
  });
});

describe("toImageAnalysis", () => {
  const many = Array.from({ length: 25 }, () => ({ source: "instagram" as const, card: card() }));

  it("fills tallied fields from counts and the rest from the summary, all for review", () => {
    const ia = toImageAnalysis(aggregateCards(many), SUMMARY);
    expect(ia.content_mix).toEqual({ value: ["Product shot 100%"], confidence: "high", evidence_type: "explicit", status: "needs_review" });
    expect(ia.purpose_mix.value).toEqual(["Promote 100%"]);
    expect(ia.dominant_colors.value).toEqual(["forest green #2F5D3A"]);
    expect(ia.aesthetic).toEqual({ value: "Clean and natural", confidence: "high", evidence_type: "inferred", status: "needs_review" });
    expect(ia.recurring_motifs.value).toEqual(["steel bowls"]);
    expect(Object.keys(ia)).toHaveLength(14);
  });

  it("lowers confidence when few images back it", () => {
    const ia = toImageAnalysis(aggregateCards(many.slice(0, 3)), SUMMARY);
    expect(ia.aesthetic.confidence).toBe("low");
    expect(toImageAnalysis(aggregateCards(many.slice(0, 8)), SUMMARY).aesthetic.confidence).toBe("medium");
  });

  it("leaves fields empty without a summary", () => {
    const ia = toImageAnalysis(aggregateCards([]), null);
    expect(ia.content_mix.value).toBeNull();
    expect(ia.aesthetic.value).toBeNull();
  });
});
