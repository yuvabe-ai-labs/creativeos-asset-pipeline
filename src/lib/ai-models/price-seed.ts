// D534 — today's video and image prices as ai_model_prices rows, for migration 0078. Built from
// the code tables' own public functions at every value each model can take, so a row prices
// exactly what the code does (the equivalence test proves it). Lives until Plan 2a-ii deletes
// the tables; 0078 is then frozen history.
import { imageGenClientModels } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { computeVideoCost, OMNI_11_REROUTE_AT } from "@/lib/video-gen/cost";
import { computeVideoCostFromUsage, omniEstimateExtrasUsd } from "@/lib/video-gen/provider-usage";
import {
  computeImageCost, estimateImageOutputCost, estimateGeminiInputTokens, estimateOpenAIInputTokens,
  estimateGeminiTextOutputCost, seedreamReferenceCostUsd,
} from "@/lib/image-gen/cost";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { parseAiModelPriceRow } from "./schema";
import { SEED_JSON_TAG } from "./seed";
import type { AiModelPrice, PriceLine } from "./types";

export const PRICE_EPOCH = "2026-01-01T00:00:00.000Z";

export type AiModelPriceSeedRow = {
  model_id: string;
  effective_from: string;
  lines: PriceLine[];
  estimate: Record<string, number>;
  source_url: string | null;
  note: string;
};

const SOURCES: Record<string, string> = {
  gemini: "https://aistudio.google.com/docs/pricing",
  veo: "https://aistudio.google.com/docs/pricing",
  openai: "https://developers.openai.com/api/docs/pricing",
  kling: "https://kling.ai/document-api/pricing/base/video",
};
const NOTE = "Seeded from the code price tables (D534).";

const VIDEO_RESOLUTIONS = ["360p", "480p", "720p", "1080p", "4k"];
const OPENAI_QUALITIES = ["low", "medium", "high", "xhigh", "max"];
const OPENAI_SIZES = ["1024x1024", "1536x1024", "1024x1536"];
const IMAGE_SIZES = ["512", "1K", "1.5K", "2K", "3K", "4K"];
const MILLION = 1_000_000;

function videoLines(modelId: string, provider: string, at: Date): { lines: PriceLine[]; estimate: Record<string, number> } {
  const lines: PriceLine[] = [];
  for (const resolution of VIDEO_RESOLUTIONS) {
    // Only Kling's price moves with audio; every other model has one rate per resolution.
    const audios = provider === "kling" ? [true, false] : [false];
    for (const audio of audios) {
      const cost = computeVideoCost(modelId, 1, audio, resolution, at);
      if (!cost) continue;
      lines.push({
        meter: "video_second",
        unit_usd: cost.usd,
        when: provider === "kling" ? { resolution, audio } : { resolution },
      });
    }
  }

  const estimate: Record<string, number> = {};
  const omni = (o: Partial<{ inputTokens: number; videoOutputTokens: number; textOutputTokens: number; thoughtTokens: number }>) =>
    computeVideoCostFromUsage(
      modelId,
      { kind: "omni", inputTokens: 0, videoOutputTokens: 0, textOutputTokens: 0, thoughtTokens: 0, ...o },
      "720p",
      at,
    );
  const inputRate = omni({ inputTokens: MILLION })?.usd;
  if (inputRate !== undefined) {
    lines.push(
      { meter: "input_token", unit_usd: inputRate / MILLION },
      { meter: "video_output_token", unit_usd: omni({ videoOutputTokens: MILLION })!.usd / MILLION },
      { meter: "text_output_token", unit_usd: omni({ textOutputTokens: MILLION })!.usd / MILLION },
      { meter: "thought_token", unit_usd: omni({ thoughtTokens: MILLION })!.usd / MILLION },
    );
    const extras = (images: number, resolution: string, editInputSeconds: number) =>
      omniEstimateExtrasUsd(modelId, { images, resolution, editInputSeconds });
    const thoughtRate = omni({ thoughtTokens: MILLION })!.usd / MILLION;
    const perToken = inputRate / MILLION;
    estimate.thought_tokens = Math.round(extras(0, "720p", 0) / thoughtRate);
    estimate.input_tokens_per_image = Math.round((extras(1, "720p", 0) - extras(0, "720p", 0)) / perToken);
    for (const resolution of ["360p", "720p", "1080p", "4k"]) {
      estimate[`edit_input_tokens_per_second_${resolution}`] =
        Math.round((extras(0, resolution, 1) - extras(0, resolution, 0)) / perToken);
    }
  }

  const seedance = (resolution: string) =>
    computeVideoCostFromUsage(modelId, { kind: "seedance", completionTokens: MILLION }, resolution, at);
  const standard = seedance("720p");
  if (standard) {
    const hd = seedance("1080p")!;
    if (hd.usd !== standard.usd) {
      lines.push({ meter: "video_output_token", unit_usd: hd.usd / MILLION, when: { resolution: "1080p" } });
    }
    lines.push({ meter: "video_output_token", unit_usd: standard.usd / MILLION });
  }
  return { lines, estimate };
}

function tokenRate(modelId: string, key: keyof ImageTokenUsage): number {
  const base: ImageTokenUsage = { text_input_tokens: 0, image_input_tokens: 0, image_output_tokens: 0, total_tokens: 0 };
  return (computeImageCost(modelId, { ...base, [key]: MILLION })?.usd ?? 0) / MILLION;
}

function imageLines(modelId: string): { lines: PriceLine[]; estimate: Record<string, number> } {
  const lines: PriceLine[] = [];
  const isOpenAI = modelId.startsWith("openai:");
  if (isOpenAI) {
    for (const quality of OPENAI_QUALITIES) {
      for (const size of OPENAI_SIZES) {
        const usd = estimateImageOutputCost(modelId, quality, size);
        if (usd !== null) lines.push({ meter: "output_image", unit_usd: usd, when: { quality, size } });
      }
    }
  } else {
    for (const size of IMAGE_SIZES) {
      const usd = estimateImageOutputCost(modelId, undefined, size);
      if (usd !== null) lines.push({ meter: "output_image", unit_usd: usd, when: { size } });
    }
  }

  const estimate: Record<string, number> = {};
  if (modelId.startsWith("seedream:")) {
    lines.push({ meter: "input_image", unit_usd: seedreamReferenceCostUsd(modelId, 2) });
    return { lines, estimate };
  }

  lines.push(
    { meter: "text_input_token", unit_usd: tokenRate(modelId, "text_input_tokens") },
    { meter: "image_input_token", unit_usd: tokenRate(modelId, "image_input_tokens") },
    { meter: "image_output_token", unit_usd: tokenRate(modelId, "image_output_tokens") },
  );
  const textOut = tokenRate(modelId, "text_output_tokens");
  if (textOut > 0) {
    lines.push(
      { meter: "text_output_token", unit_usd: textOut },
      { meter: "thought_token", unit_usd: tokenRate(modelId, "thought_tokens") },
    );
  }

  const tokens = isOpenAI
    ? (n: number) => estimateOpenAIInputTokens(modelId, n)
    : (n: number) => estimateGeminiInputTokens(n);
  estimate.input_tokens_base = tokens(0);
  estimate.input_tokens_per_reference = tokens(1) - tokens(0);
  if (!isOpenAI && textOut > 0) {
    estimate.text_output_tokens = Math.round(estimateGeminiTextOutputCost(modelId) / textOut);
  }
  return { lines, estimate };
}

export function priceRowsFromCodeTables(): AiModelPriceSeedRow[] {
  const rows: AiModelPriceSeedRow[] = [];
  const row = (modelId: string, provider: string, at: string, priced: { lines: PriceLine[]; estimate: Record<string, number> }) => ({
    model_id: modelId,
    effective_from: at,
    lines: priced.lines,
    estimate: priced.estimate,
    source_url: SOURCES[provider] ?? null,
    note: NOTE,
  });

  for (const m of imageGenClientModels) rows.push(row(m.id, m.provider, PRICE_EPOCH, imageLines(m.id)));

  for (const m of Object.values(videoGenClientModelMap)) {
    const epoch = videoLines(m.id, m.provider, new Date(PRICE_EPOCH));
    rows.push(row(m.id, m.provider, PRICE_EPOCH, epoch));
    // A price the code changes on a date (Omni 1.1 billed at 1.2 rates from 3 Dec) is a second row.
    const later = videoLines(m.id, m.provider, OMNI_11_REROUTE_AT);
    if (JSON.stringify(later) !== JSON.stringify(epoch)) {
      rows.push(row(m.id, m.provider, OMNI_11_REROUTE_AT.toISOString(), later));
    }
  }
  return rows;
}

export function priceSeedSql(rows: AiModelPriceSeedRow[]): string {
  const json = JSON.stringify(rows, null, 2);
  if (json.includes(SEED_JSON_TAG)) throw new Error(`Seed JSON contains ${SEED_JSON_TAG}`);
  const cols = "model_id, effective_from, lines, estimate, source_url, note";
  return [
    "-- D534: today's video and image prices, from the code price tables.",
    "-- Generated by src/lib/ai-models/price-seed.ts. Regenerate with:",
    "--   UPDATE_SEED=1 npx vitest run src/lib/ai-models/__tests__/price-seed-migration.test.ts",
    `insert into ai_model_prices (${cols})`,
    `select ${cols}`,
    `from jsonb_to_recordset(${SEED_JSON_TAG}${json}${SEED_JSON_TAG}::jsonb) as r(`,
    "  model_id text, effective_from timestamptz, lines jsonb, estimate jsonb, source_url text, note text",
    ")",
    "on conflict (model_id, effective_from) do nothing;",
    "",
  ].join("\n");
}

export function seedRowToPrice(row: AiModelPriceSeedRow): AiModelPrice {
  const price = parseAiModelPriceRow({
    id: `${row.model_id}@${row.effective_from}`,
    ...JSON.parse(JSON.stringify(row)),
  });
  if (!price) throw new Error(`Seed price row for ${row.model_id} fails the catalog's check`);
  return price;
}

let codeTablePrices: AiModelPrice[] | null = null;

/** Transitional (removed in Plan 2a-ii): the row the seed holds for a model now, from the code
 *  tables. Built once per page load; callers run in render. */
export function priceFromCodeTables(modelId: string, at: Date = new Date()): AiModelPrice | null {
  codeTablePrices ??= priceRowsFromCodeTables().map(seedRowToPrice);
  let best: AiModelPrice | null = null;
  for (const p of codeTablePrices) {
    if (p.modelId !== modelId || new Date(p.effectiveFrom) > at) continue;
    if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
  }
  return best;
}
