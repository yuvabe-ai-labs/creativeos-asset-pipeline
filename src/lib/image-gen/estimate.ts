import "server-only";
import { estimateImageOutputCost, estimateImageInputCost } from "./cost";
import { countGeminiInputTokens } from "./providers/gemini";
import { countOpenAIInputTokens, aspectRatioToOpenAISize } from "./providers/openai";

/**
 * Exact-when-possible pre-generation cost estimate for an image model, in USD. Shared by the
 * real generation route (image-generate/route.ts, which reserves against it) and the
 * estimate-only preview route (image-generate/estimate/route.ts) — the same computation
 * either way, so what's shown to the user always matches what gets reserved. Returns null
 * when estimateImageOutputCost has no priced entry for this model/quality/size — the real
 * route fails closed on null (design spec §4); the preview route just shows "unavailable".
 */
export async function estimateImageGenerationCostUsd(input: {
  modelId: string;
  quality: string | undefined;
  aspectRatio: string | undefined;
  imageSize: string | undefined;
  prompt: string;
  referenceUrls: string[];
}): Promise<number | null> {
  const isOpenAI = input.modelId.startsWith("openai:");
  const sizeKey = isOpenAI
    ? aspectRatioToOpenAISize(input.aspectRatio ?? "1:1")
    : (input.imageSize ?? "1K");

  const outputCostUsd = estimateImageOutputCost(input.modelId, input.quality, sizeKey);
  if (outputCostUsd === null) return null;

  const hasReferenceImages = input.referenceUrls.length > 0;
  const inputTokens = isOpenAI
    ? await countOpenAIInputTokens(input.prompt, input.referenceUrls)
    : await countGeminiInputTokens(input.modelId.split(":")[1], input.prompt, input.referenceUrls);
  const inputCostUsd = estimateImageInputCost(input.modelId, inputTokens, hasReferenceImages) ?? 0;

  return outputCostUsd + inputCostUsd;
}
