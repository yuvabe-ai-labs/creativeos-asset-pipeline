import { describe, it, expect } from "vitest";
import { aggregateCards, buildSummaryInput, selectCardsForSummary, toImageAnalysis, type ImageSummary } from "./summarize";
import type { CardEntry } from "./aggregate";
import type { ImageCard } from "./card-schema";

const card = (over: Partial<ImageCard> = {}): ImageCard => ({
  format: "product_shot",
  purpose: "promote",
  summary: "Flour pack on cream",
  subjects: ["flour pack"],
  product: { visible: true, presentation: "packshot" },
  setting: "studio",
  background: "plain cream",
  composition: { shot_type: "close-up", angle: "eye level", framing: "centred" },
  lighting: "soft studio",
  colours: [{ name: "forest green", hex: "#2F5D3A", share: 60 }],
  mood: ["wholesome"],
  style_tags: ["clean"],
  people: { count: 0, description: null },
  text_overlay: { present: false, text: null, font_style: null, colours_hex: [], placement: null, treatment: null },
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
  });

  it("lists uploads first and leaves third-party images out", () => {
    expect(text.indexOf("Hero packshot")).toBeLessThan(text.indexOf("Reel cover"));
    expect(text).not.toContain("Retailer badge");
  });
});

describe("selectCardsForSummary", () => {
  const many = (source: CardEntry["source"], format: ImageCard["format"], n: number): CardEntry[] =>
    Array.from({ length: n }, () => ({ source, card: card({ format }) }));

  it("sends every card when they fit, uploads first", () => {
    const entries = [...many("instagram", "in_use", 3), ...many("upload", "product_shot", 2)];
    const out = selectCardsForSummary(entries, 10);
    expect(out).toHaveLength(5);
    expect(out.slice(0, 2).every((e) => e.source === "upload")).toBe(true);
  });

  it("above the cap, keeps every upload and balances the rest across format and source", () => {
    const entries = [...many("instagram", "in_use", 90), ...many("website", "product_shot", 10), ...many("upload", "people", 4)];
    const out = selectCardsForSummary(entries, 24);
    expect(out).toHaveLength(24);
    expect(out.filter((e) => e.source === "upload")).toHaveLength(4);
    // Round-robin: the 10 website product images are not crowded out by 90 Instagram posts.
    expect(out.filter((e) => e.source === "website")).toHaveLength(10);
    expect(out.filter((e) => e.source === "instagram")).toHaveLength(10);
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
