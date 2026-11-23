// D534 — an image run's estimate and charge, from its model's price row. Client-safe.
import { aspectRatioToOpenAISize } from "@/lib/image-gen/cost";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { lineFor, priceMeters, type MeterQuantities, type PriceDims } from "./pricing";
import type { AiModelPrice, Meter } from "./types";

export function imageDims(
  modelId: string,
  a: { quality?: string; aspectRatio?: string; imageSize?: string },
): PriceDims {
  if (modelId.startsWith("openai:")) {
    // "auto" has no published price (OpenAI picks the tier), so it is estimated as high.
    const quality = a.quality === undefined || a.quality === "auto" ? "high" : a.quality;
    return { quality, size: aspectRatioToOpenAISize(a.aspectRatio ?? "1:1") };
  }
  return { size: a.imageSize ?? "1K" };
}

/** The allowances imageEstimateUsd reads from a price row's estimate (none for Seedream). */
export const IMAGE_ESTIMATE_KEYS = ["input_tokens_base", "input_tokens_per_reference", "text_output_tokens"] as const;

/** What one image is reserved at. Null when the image itself has no price at these settings. */
export function imageEstimateUsd(
  price: AiModelPrice,
  a: { modelId: string; quality?: string; aspectRatio?: string; imageSize?: string; referenceCount: number },
): number | null {
  const dims = imageDims(a.modelId, a);
  if (!lineFor(price, "output_image", dims)) return null;
  if (a.modelId.startsWith("seedream:")) {
    // Billed per image: the first reference is free, each further one is priced.
    return priceMeters(price, { output_image: 1, input_image: Math.max(0, a.referenceCount - 1) }, dims).usd;
  }
  const e = price.estimate;
  const inputTokens = (e.input_tokens_base ?? 0) + a.referenceCount * (e.input_tokens_per_reference ?? 0);
  // With references, every input token is estimated at the image rate (never under-reserves).
  const meters: MeterQuantities = {
    output_image: 1,
    [a.referenceCount > 0 ? "image_input_token" : "text_input_token"]: inputTokens,
    text_output_token: e.text_output_tokens ?? 0,
  };
  return priceMeters(price, meters, dims).usd;
}

export type BilledImages = { output_image: number; input_image: number; size: string };

export function imageTokenMeters(tokens: ImageTokenUsage): MeterQuantities {
  return {
    text_input_token: tokens.text_input_tokens,
    image_input_token: tokens.image_input_tokens,
    image_output_token: tokens.image_output_tokens,
    text_output_token: tokens.text_output_tokens ?? 0,
    thought_token: tokens.thought_tokens ?? 0,
  };
}

/** What the image cost: billed images (Seedream) or the provider's tokens. Null with neither. */
export function imageChargeUsd(
  price: AiModelPrice,
  a: { tokens: ImageTokenUsage | null; billedImages: BilledImages | null },
): { usd: number; unpriced: Meter[]; meters: MeterQuantities } | null {
  if (a.billedImages) {
    const meters = { output_image: a.billedImages.output_image, input_image: a.billedImages.input_image };
    return { ...priceMeters(price, meters, { size: a.billedImages.size }), meters };
  }
  if (a.tokens) {
    const meters = imageTokenMeters(a.tokens);
    return { ...priceMeters(price, meters), meters };
  }
  return null;
}
