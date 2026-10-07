// Cards → the Brand KB's Image Analysis section (D312). The pure parts (the input text and the
// final KB fields) are exported for tests; summarizeImages makes the one model call.
import { z } from "zod";
import type { KBField, TraceableBrandKB } from "@/lib/kb/schema";
import { aggregateCards, colourLines, formatMixLines, purposeMixLines, type CardEntry, type ImageStats } from "./aggregate";
import {
  CONFIDENCE_AT,
  IMAGE_FORMAT_LABELS,
  IMAGE_PURPOSE_LABELS,
  NON_BRAND_FORMATS,
  SOURCE_WEIGHT,
  SUMMARY_MAX_CARDS,
} from "./constants";

/** What the model writes: every field except the three tallied in code. */
export const ImageSummarySchema = z.object({
  aesthetic: z.string(),
  visual_mood: z.string(),
  subjects: z.string(),
  product_presentation: z.string(),
  composition_style: z.string(),
  lighting_character: z.string(),
  settings_backgrounds: z.string(),
  people_casting: z.string(),
  text_overlay_style: z.string(),
  recurring_motifs: z.array(z.string()),
  brand_consistency_notes: z.string(),
});
export type ImageSummary = z.infer<typeof ImageSummarySchema>;

const SOURCE_LABEL = { upload: "upload", website: "website", instagram: "instagram", facebook: "facebook" } as const;

/**
 * The cards the summary sees: all of them when they fit; otherwise a balanced sample — every upload
 * first (the team chose them), then taking each format and source in turn, so a brand with 900
 * Instagram posts and 60 website images is not summarised from Instagram alone. Uploads lead the
 * returned order either way.
 */
export function selectCardsForSummary(entries: CardEntry[], cap: number): CardEntry[] {
  const byWeight = [...entries].sort((a, b) => SOURCE_WEIGHT[b.source] - SOURCE_WEIGHT[a.source]);
  if (byWeight.length <= cap) return byWeight;

  const uploads = byWeight.filter((e) => e.source === "upload").slice(0, cap);
  const groups = new Map<string, CardEntry[]>();
  for (const e of byWeight) {
    if (e.source === "upload") continue;
    const key = `${e.card.format}|${e.source}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const picked = [...uploads];
  const queues = [...groups.values()];
  while (picked.length < cap && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && picked.length < cap) picked.push(next);
    }
  }
  return picked;
}

/** The tallies and the cards, as compact text for the summary call. Uploads first. */
export function buildSummaryInput(stats: ImageStats, entries: CardEntry[]): string {
  const lines: string[] = [];
  lines.push(`Brand images counted: ${stats.counted} (uploads ${stats.bySource.upload}, website ${stats.bySource.website}, instagram ${stats.bySource.instagram}, facebook ${stats.bySource.facebook}); ${stats.excluded} third-party or interface images left out.`);
  lines.push(`Format mix (what the images look like): ${formatMixLines(stats).join(", ") || "none"}.`);
  lines.push(`Purpose mix (why they were posted): ${purposeMixLines(stats).join(", ") || "none"}.`);
  lines.push(`Dominant colours (weighted): ${colourLines(stats).join(", ") || "none"}.`);
  lines.push(`Images with people: ${stats.withPeoplePct}%. Product visible: ${stats.productVisiblePct}%. Polish: ${stats.polish.map((p) => `${p.value} ${p.count}`).join(", ")}.`);
  const o = stats.overlays;
  lines.push(
    `Text overlays on ${o.count} images (${o.pct}%). Font styles: ${o.fontStyles.map((f) => `${f.value} ${f.count}`).join(", ") || "none"}. ` +
      `Overlay colours: ${o.colours.map((c) => c.hex).join(", ") || "none"}. Placements: ${o.placements.map((p) => `${p.value} ${p.count}`).join(", ") || "none"}. ` +
      `Treatments: ${o.treatments.map((t) => `${t.value} ${t.count}`).join(", ") || "none"}.`,
  );
  lines.push("", "Cards (source | format | purpose | summary | setting / background | composition | lighting | mood | people | overlay):");

  const brand = selectCardsForSummary(
    entries.filter((e) => !NON_BRAND_FORMATS.has(e.card.format)),
    SUMMARY_MAX_CARDS,
  );
  for (const { source, card: c } of brand) {
    const overlay = c.text_overlay.present
      ? `${c.text_overlay.font_style ?? "text"} ${c.text_overlay.colours_hex.join("/")} ${c.text_overlay.placement ?? ""} "${(c.text_overlay.text ?? "").slice(0, 60)}"`
      : "-";
    lines.push(
      [
        SOURCE_LABEL[source],
        IMAGE_FORMAT_LABELS[c.format],
        IMAGE_PURPOSE_LABELS[c.purpose],
        c.summary,
        [c.setting, c.background].filter(Boolean).join(" / ") || "-",
        `${c.composition.shot_type}, ${c.composition.angle}, ${c.composition.framing}`,
        c.lighting,
        c.mood.join(", "),
        c.people.count ? `${c.people.count}: ${c.people.description ?? ""}` : "-",
        overlay,
      ].join(" | "),
    );
  }
  return lines.join("\n");
}

const confidenceFor = (n: number): KBField<unknown>["confidence"] =>
  n >= CONFIDENCE_AT.high ? "high" : n >= CONFIDENCE_AT.medium ? "medium" : "low";

/** Assembles the 14 KB fields: tallied ones as explicit evidence, written ones as inferred.
 *  Every field goes back to "needs review" so the team sees what changed. */
export function toImageAnalysis(stats: ImageStats, summary: ImageSummary | null): TraceableBrandKB["image_analysis"] {
  const confidence = confidenceFor(stats.counted);
  const tallied = <T>(value: T | null): KBField<T> => ({
    value,
    confidence: value === null ? "low" : confidence,
    evidence_type: "explicit",
    status: "needs_review",
  });
  const written = <T>(value: T | null | undefined): KBField<T> => ({
    value: value ?? null,
    confidence: value == null ? "low" : confidence,
    evidence_type: "inferred",
    status: "needs_review",
  });
  const formats = formatMixLines(stats);
  const purposes = purposeMixLines(stats);
  const colours = colourLines(stats);
  return {
    content_mix: tallied(formats.length ? formats : null),
    purpose_mix: tallied(purposes.length ? purposes : null),
    dominant_colors: tallied(colours.length ? colours : null),
    aesthetic: written(summary?.aesthetic),
    visual_mood: written(summary?.visual_mood),
    subjects: written(summary?.subjects),
    product_presentation: written(summary?.product_presentation),
    composition_style: written(summary?.composition_style),
    lighting_character: written(summary?.lighting_character),
    settings_backgrounds: written(summary?.settings_backgrounds),
    people_casting: written(summary?.people_casting),
    text_overlay_style: written(summary?.text_overlay_style),
    recurring_motifs: written(summary?.recurring_motifs?.length ? summary.recurring_motifs : null),
    brand_consistency_notes: written(summary?.brand_consistency_notes),
  };
}

export { aggregateCards };
