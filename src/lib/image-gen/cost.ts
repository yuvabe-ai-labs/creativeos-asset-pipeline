import { USD_TO_INR } from "@/lib/pricing";
import type { ImageTokenUsage } from "./types";

type ImagePricingEntry = {
  textIn?: number;
  imgIn?: number;
  imgOut: number;
};

// Keys must exactly match ImageGenModelConfig.id values in registry.ts
const IMAGE_MODEL_PRICING: Record<string, ImagePricingEntry> = {
  "openai:gpt-image-2":                    { textIn: 5.00, imgIn: 8.00,  imgOut: 30.00 },
  "openai:gpt-image-1":                    { textIn: 5.00, imgIn: 10.00, imgOut: 40.00 },
  "openai:gpt-image-1-mini":               { textIn: 2.00, imgIn: 2.50,  imgOut: 8.00  },
  // Source: ai.google.dev/gemini-api/docs/pricing (verified 2026-07-24). Google prices
  // text+image input as one combined rate per model, not split — textIn/imgIn are set
  // equal to that single published rate so the existing per-field formula still sums to
  // the right combined cost.
  "gemini:gemini-2.5-flash-image": { textIn: 0.30, imgIn: 0.30,  imgOut: 30.00  },
  "gemini:gemini-3.1-flash-image": { textIn: 0.50, imgIn: 0.50,  imgOut: 60.00  },
  "gemini:gemini-3-pro-image":     { textIn: 2.00, imgIn: 2.00,  imgOut: 120.00 },
};

export function computeImageCost(
  modelId: string,
  tokens: ImageTokenUsage,
): { usd: number; inr: number } | null {
  const p = IMAGE_MODEL_PRICING[modelId];
  if (!p) return null;
  const usd =
    ((tokens.text_input_tokens  ?? 0) / 1_000_000) * (p.textIn ?? 0) +
    ((tokens.image_input_tokens ?? 0) / 1_000_000) * (p.imgIn  ?? 0) +
    ((tokens.image_output_tokens ?? 0) / 1_000_000) * p.imgOut;
  return { usd, inr: usd * USD_TO_INR };
}

// Exact per-image OUTPUT cost by quality x size, sourced directly from vendor $ price
// tables — see docs/superpowers/specs/2026-07-24-credit-system-design.md §5 and
// docs/superpowers/specs/2026-07-24-credit-system-full-combinations.md. Not derived from
// the token-based IMAGE_MODEL_PRICING above (gpt-image-2 has no public token table). Input
// tokens (prompt text + reference images) come from a separate live call — see
// countGeminiInputTokens/countOpenAIInputTokens in providers/{gemini,openai}.ts — not
// tabulated here.
type ImageEstimateQualityRow = Record<string, number>; // size string -> USD

const OPENAI_IMAGE_ESTIMATE_TABLE: Record<
  string,
  { low: ImageEstimateQualityRow; medium: ImageEstimateQualityRow; high: ImageEstimateQualityRow }
> = {
  "openai:gpt-image-2": {
    low:    { "1024x1024": 0.006, "1024x1536": 0.005, "1536x1024": 0.005 },
    medium: { "1024x1024": 0.053, "1024x1536": 0.041, "1536x1024": 0.041 },
    high:   { "1024x1024": 0.211, "1024x1536": 0.165, "1536x1024": 0.165 },
  },
  "openai:gpt-image-1": {
    low:    { "1024x1024": 0.011, "1024x1536": 0.016, "1536x1024": 0.016 },
    medium: { "1024x1024": 0.042, "1024x1536": 0.063, "1536x1024": 0.063 },
    high:   { "1024x1024": 0.167, "1024x1536": 0.25,  "1536x1024": 0.25  },
  },
  "openai:gpt-image-1-mini": {
    low:    { "1024x1024": 0.005, "1024x1536": 0.006, "1536x1024": 0.006 },
    medium: { "1024x1024": 0.011, "1024x1536": 0.015, "1536x1024": 0.015 },
    high:   { "1024x1024": 0.036, "1024x1536": 0.052, "1536x1024": 0.052 },
  },
};

// Gemini prices by size tier only (no quality param) — flat per size, aspect-ratio-
// irrelevant within a tier (design spec §5's stated assumption, not a vendor-confirmed fact).
const GEMINI_IMAGE_ESTIMATE_TABLE: Record<string, Record<string, number>> = {
  "gemini:gemini-2.5-flash-image": { "1K": 0.039 },
  "gemini:gemini-3.1-flash-image": { "512": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  "gemini:gemini-3-pro-image":     { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
};

/**
 * Exact pre-generation OUTPUT cost estimate for an image model. Returns USD (not credits —
 * callers apply usdToFinalCredits from src/lib/credits/units.ts). `quality` is ignored for
 * Gemini models (no such param). "auto" (a real option on gpt-image-2/gpt-image-1 — no
 * option on -mini) has no published price since OpenAI resolves the tier server-side;
 * treated as "high" (worst case) so the estimate never falls short of the real charge.
 */
export function estimateImageOutputCost(
  modelId: string,
  quality: string | undefined,
  size: string,
): number | null {
  const openaiEntry = OPENAI_IMAGE_ESTIMATE_TABLE[modelId];
  if (openaiEntry) {
    const effectiveQuality = quality === "auto" || quality === undefined ? "high" : quality;
    const row = openaiEntry[effectiveQuality as "low" | "medium" | "high"];
    return row?.[size] ?? null;
  }
  const geminiEntry = GEMINI_IMAGE_ESTIMATE_TABLE[modelId];
  if (geminiEntry) {
    return geminiEntry[size] ?? null;
  }
  return null;
}
