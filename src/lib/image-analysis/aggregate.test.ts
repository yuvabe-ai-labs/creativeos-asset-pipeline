import { describe, it, expect } from "vitest";
import { aggregateCards, clusterColours, colourLines, formatMixLines, purposeMixLines, type CardEntry } from "./aggregate";
import type { ImageCard } from "./card-schema";

const card = (over: Partial<ImageCard> = {}): ImageCard => ({
  format: "product_shot",
  purpose: "promote",
  summary: "A pack of flour",
  subjects: ["flour pack"],
  product: { visible: true, presentation: "packshot" },
  setting: "studio",
  background: "plain",
  background_note: "cream backdrop",
  composition: { shot_type: "close_up", angle: "eye_level", framing: "centred", note: "pack upright" },
  lighting: "studio",
  lighting_note: "soft and even",
  colours: [{ name: "forest green", hex: "#2F5D3A", share: 60 }],
  mood: ["wholesome"],
  style_tags: ["clean"],
  people: { count: 0, description: null },
  text_overlay: { present: false, text: null, font_style: null, font_note: null, colours_hex: [], placement: null, treatment: null, note: null },
  logo_visible: true,
  polish: "professional",
  ...over,
});

describe("clusterColours", () => {
  it("merges near-identical colours, keeping the heaviest member's hex and name", () => {
    const out = clusterColours(
      [
        { name: "Green", hex: "#2F5D3A", weight: 3 },
        { name: "dark green", hex: "#305C3B", weight: 1 },
        { name: "cream", hex: "#f4eedc", weight: 2 },
      ],
      6,
    );
    expect(out).toEqual([
      { name: "green", hex: "#2F5D3A", weight: 4 },
      { name: "cream", hex: "#F4EEDC", weight: 2 },
    ]);
  });

  it("merges two shades the model named alike, but keeps differently named near colours apart", () => {
    const out = clusterColours(
      [
        { name: "yellow", hex: "#F5E135", weight: 2 },
        { name: "Yellow", hex: "#FED800", weight: 1 },
        { name: "white", hex: "#FFFFFF", weight: 2 },
        { name: "cream", hex: "#F4EEDC", weight: 1 },
      ],
      6,
    );
    expect(out.map((c) => c.name)).toEqual(["yellow", "white", "cream"]);
    expect(out[0]).toMatchObject({ hex: "#F5E135", weight: 3 });
  });

  it("drops values that are not hex codes", () => {
    expect(clusterColours([{ name: "x", hex: "green", weight: 1 }], 6)).toEqual([]);
  });
});

describe("aggregateCards", () => {
  const entries: CardEntry[] = [
    { source: "upload", card: card() },
    { source: "instagram", card: card({ format: "in_use", purpose: "inspire", colours: [{ name: "cream", hex: "#F4EEDC", share: 80 }] }) },
    { source: "instagram", card: card({ format: "in_use", purpose: "inspire", colours: [{ name: "cream", hex: "#F4EEDC", share: 80 }] }) },
    {
      source: "website",
      card: card({
        format: "text_graphic",
        purpose: "educate",
        text_overlay: { present: true, text: "Eat well", font_style: "sans", font_note: "bold caps", colours_hex: ["#ffffff"], placement: "bottom", treatment: "plain", note: "lower left" },
        lighting: "flat_graphic",
      }),
    },
    // A retailer badge from the website: kept as a card, left out of every tally.
    { source: "website", card: card({ format: "third_party_or_ui", colours: [{ name: "yellow", hex: "#FFE500", share: 100 }] }) },
  ];
  const stats = aggregateCards(entries);

  it("counts only the brand's own images, by source", () => {
    expect(stats.counted).toBe(4);
    expect(stats.excluded).toBe(1);
    expect(stats.bySource).toEqual({ upload: 1, website: 1, instagram: 2, facebook: 0 });
  });

  it("reports the format and purpose mixes as plain shares", () => {
    expect(formatMixLines(stats)).toEqual(["In use 50%", "Product shot 25%", "Text & graphic 25%"]);
    expect(purposeMixLines(stats)).toEqual(["Inspire 50%", "Educate 25%", "Promote 25%"]);
  });

  it("weights colours by share and source, ignoring third-party images", () => {
    // Uploaded green: 0.6 × 3 = 1.8 (+ website text graphic 0.6) vs cream: 0.8 + 0.8 = 1.6.
    expect(colourLines(stats)).toEqual(["forest green #2F5D3A", "cream #F4EEDC"]);
    expect(stats.colours.some((c) => c.hex === "#FFE500")).toBe(false);
  });

  it("tallies text overlays", () => {
    expect(stats.overlays).toMatchObject({
      count: 1,
      pct: 25,
      fontStyles: [{ key: "sans", label: "sans", count: 1, pct: 100 }],
      placements: [{ key: "bottom", label: "bottom", count: 1, pct: 100 }],
    });
    expect(stats.overlays.colours[0].hex).toBe("#FFFFFF");
  });

  it("counts the look over the brand's images, with readable labels", () => {
    expect(stats.look.lighting).toEqual([
      { key: "studio", label: "studio", count: 3, pct: 75 },
      { key: "flat_graphic", label: "flat graphic", count: 1, pct: 25 },
    ]);
    expect(stats.look.shot_type).toEqual([{ key: "close_up", label: "close up", count: 4, pct: 100 }]);
  });

  it("handles no images", () => {
    expect(aggregateCards([])).toMatchObject({ counted: 0, formatMix: [], purposeMix: [], colours: [] });
  });
});
