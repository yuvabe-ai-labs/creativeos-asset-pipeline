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
  "gemini:gemini-3.1-flash-image-preview": { imgOut: 60.00 },
  "gemini:gemini-3-pro-image-preview":     { imgOut: 80.00 }, // estimated — update when Google publishes
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
