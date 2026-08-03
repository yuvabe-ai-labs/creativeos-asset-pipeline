import "server-only";
import {
  estimateImageOutputCost,
  estimateImageInputCost,
  estimateGeminiInputTokens,
  estimateOpenAIInputTokens,
} from "./cost";
import { aspectRatioToOpenAISize } from "./providers/openai";

/**
 * Exact-when-possible pre-generation cost estimate for an image model, in USD. Shared by the
 * real generation route (image-generate/route.ts, which reserves against it) and the
 * estimate-only preview route (image-generate/estimate/route.ts) — the same computation
 * either way, so what's shown to the user always matches what gets reserved. Returns null
 * when estimateImageOutputCost has no priced entry for this model/quality/size — the real
 * route fails closed on null (design spec §4); the preview route just shows "unavailable".
 *
 * Synchronous — input-token cost is a static derived estimate (D92,
 * docs/superpowers/specs/2026-08-03-image-input-cost-static-estimate-design.md), not a live
 * per-request vendor API call.
 */
export function estimateImageGenerationCostUsd(input: {
  modelId: string;
  quality: string | undefined;
  aspectRatio: string | undefined;
  imageSize: string | undefined;
  referenceUrls: string[];
}): number | null {
  const isOpenAI = input.modelId.startsWith("openai:");
  const sizeKey = isOpenAI
    ? aspectRatioToOpenAISize(input.aspectRatio ?? "1:1")
    : (input.imageSize ?? "1K");

  const outputCostUsd = estimateImageOutputCost(input.modelId, input.quality, sizeKey);
  if (outputCostUsd === null) return null;

  const referenceCount = input.referenceUrls.length;
  const hasReferenceImages = referenceCount > 0;
  const inputTokens = isOpenAI
    ? estimateOpenAIInputTokens(input.modelId, referenceCount)
    : estimateGeminiInputTokens(referenceCount);
  const inputCostUsd = estimateImageInputCost(input.modelId, inputTokens, hasReferenceImages) ?? 0;

  return outputCostUsd + inputCostUsd;
}
