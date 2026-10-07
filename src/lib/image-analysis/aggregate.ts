// Cards → exact brand-level tallies (D312). Pure: counts and colours are computed here, never
// estimated by the model, so the numbers in the Image Analysis tab are real.
import type { BrandImageSource } from "@/lib/asset-import/constants";
import { normaliseHex, type ImageCard } from "./card-schema";
import {
  DOMINANT_COLOUR_COUNT,
  IMAGE_FORMATS,
  IMAGE_FORMAT_LABELS,
  IMAGE_PURPOSES,
  IMAGE_PURPOSE_LABELS,
  NON_BRAND_FORMATS,
  SOURCE_WEIGHT,
} from "./constants";

export type CardEntry = { source: BrandImageSource; card: ImageCard };

export type ColourTally = { name: string; hex: string; weight: number };

export type MixRow = { key: string; label: string; count: number; pct: number };

export type ImageStats = {
  /** Brand images counted (third-party and interface images excluded). */
  counted: number;
  excluded: number;
  bySource: Record<BrandImageSource, number>;
  /** Share of each visual format (what the images look like). */
  formatMix: MixRow[];
  /** Share of each purpose (why they were posted). */
  purposeMix: MixRow[];
  colours: ColourTally[];
  overlays: {
    count: number;
    pct: number;
    fontStyles: { value: string; count: number }[];
    colours: ColourTally[];
    placements: { value: string; count: number }[];
    treatments: { value: string; count: number }[];
  };
  withPeoplePct: number;
  productVisiblePct: number;
  polish: { value: string; count: number }[];
};

/** Two colours closer than this (RGB distance, 0–441) are the same colour whatever they are called:
 *  only near-identical hexes, since cream and white are just 41 apart. */
const SAME_COLOUR = 28;
/** Colours the model gave the same name merge across a wider gap: two "yellow"s 55 apart are one
 *  brand yellow, while cream and white (41 apart, different names) must stay two colours. */
const SAME_NAMED_COLOUR = 96;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a: string, b: string) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/**
 * Groups near-identical colours and ranks them by total weight. Each group keeps the hex and name
 * of its heaviest member, so the result is a colour the brand actually used, not an average.
 */
export function clusterColours(samples: { name: string; hex: string; weight: number }[], limit: number): ColourTally[] {
  const sorted = samples
    .map((s) => ({ ...s, hex: normaliseHex(s.hex) }))
    .filter((s): s is { name: string; hex: string; weight: number } => Boolean(s.hex) && s.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const groups: ColourTally[] = [];
  for (const s of sorted) {
    const name = s.name.trim().toLowerCase();
    const group = groups.find((g) => {
      const d = distance(g.hex, s.hex);
      return d < SAME_COLOUR || (name !== "" && g.name === name && d < SAME_NAMED_COLOUR);
    });
    if (group) group.weight += s.weight;
    else groups.push({ name, hex: s.hex, weight: s.weight });
  }
  return groups.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/** How often each (lower-cased, trimmed) value appears, most common first. */
function frequencies(values: (string | null | undefined)[], limit = 5): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v?.trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

export function aggregateCards(entries: CardEntry[]): ImageStats {
  const brand = entries.filter((e) => !NON_BRAND_FORMATS.has(e.card.format));
  const counted = brand.length;

  const bySource: Record<BrandImageSource, number> = { upload: 0, website: 0, instagram: 0, facebook: 0 };
  for (const e of brand) bySource[e.source]++;

  // The mixes are plain counts: they describe what the brand posts, so no source is weighted up.
  const mix = (keys: readonly string[], labels: Record<string, string>, of: (e: CardEntry) => string | undefined): MixRow[] =>
    keys
      .map((key) => {
        const count = brand.filter((e) => of(e) === key).length;
        return { key, label: labels[key], count, pct: pct(count, counted) };
      })
      .filter((m) => m.count > 0)
      .sort((a, b) => b.count - a.count);
  const formatMix = mix(IMAGE_FORMATS.filter((f) => !NON_BRAND_FORMATS.has(f)), IMAGE_FORMAT_LABELS, (e) => e.card.format);
  const purposeMix = mix(IMAGE_PURPOSES, IMAGE_PURPOSE_LABELS, (e) => e.card.purpose);

  const colours = clusterColours(
    brand.flatMap((e) =>
      e.card.colours.map((c) => ({ name: c.name, hex: c.hex, weight: (Math.max(0, c.share) / 100) * SOURCE_WEIGHT[e.source] })),
    ),
    DOMINANT_COLOUR_COUNT,
  );

  const withText = brand.filter((e) => e.card.text_overlay.present);
  const overlays = {
    count: withText.length,
    pct: pct(withText.length, counted),
    fontStyles: frequencies(withText.map((e) => e.card.text_overlay.font_style)),
    colours: clusterColours(
      withText.flatMap((e) =>
        e.card.text_overlay.colours_hex.map((hex) => ({ name: "", hex, weight: SOURCE_WEIGHT[e.source] })),
      ),
      4,
    ),
    placements: frequencies(withText.map((e) => e.card.text_overlay.placement)),
    treatments: frequencies(withText.map((e) => e.card.text_overlay.treatment)),
  };

  return {
    counted,
    excluded: entries.length - counted,
    bySource,
    formatMix,
    purposeMix,
    colours,
    overlays,
    withPeoplePct: pct(brand.filter((e) => e.card.people.count > 0).length, counted),
    productVisiblePct: pct(brand.filter((e) => e.card.product.visible).length, counted),
    polish: frequencies(brand.map((e) => e.card.polish), 3),
  };
}

/** The format mix as the tab shows it: "Product shot 38%". */
export const formatMixLines = (stats: ImageStats) => stats.formatMix.map((m) => `${m.label} ${m.pct}%`);

/** The purpose mix as the tab shows it: "Educate 45%". */
export const purposeMixLines = (stats: ImageStats) => stats.purposeMix.map((m) => `${m.label} ${m.pct}%`);

/** The dominant colours as the tab shows them: "forest green #2F5D3A". */
export const colourLines = (stats: ImageStats) => stats.colours.map((c) => `${c.name} ${c.hex}`.trim());
