import { describe, it, expect } from "vitest";
import { imageDims, imageEstimateUsd, imageChargeUsd, imageTokenMeters } from "../image-price";
import type { AiModelPrice } from "../types";

const GPT: AiModelPrice = {
  id: "g", modelId: "openai:gpt-image-2", effectiveFrom: "2026-01-01T00:00:00Z", sourceUrl: null, note: null,
  lines: [
    { meter: "output_image", unit_usd: 0.211, when: { quality: "high", size: "1024x1024" } },
    { meter: "output_image", unit_usd: 0.053, when: { quality: "medium", size: "1024x1024" } },
    { meter: "text_input_token", unit_usd: 5 / 1e6 },
    { meter: "image_input_token", unit_usd: 8 / 1e6 },
    { meter: "image_output_token", unit_usd: 30 / 1e6 },
  ],
  estimate: { input_tokens_base: 190, input_tokens_per_reference: 1550 },
};
const NANO: AiModelPrice = {
  id: "n", modelId: "gemini:gemini-nano-banana-2.1", effectiveFrom: "2026-01-01T00:00:00Z", sourceUrl: null, note: null,
  lines: [
    { meter: "output_image", unit_usd: 0.0336, when: { size: "1K" } },
    { meter: "text_input_token", unit_usd: 1.5 / 1e6 },
    { meter: "image_input_token", unit_usd: 1.5 / 1e6 },
    { meter: "image_output_token", unit_usd: 30 / 1e6 },
    { meter: "text_output_token", unit_usd: 7.5 / 1e6 },
    { meter: "thought_token", unit_usd: 7.5 / 1e6 },
  ],
  estimate: { input_tokens_base: 180, input_tokens_per_reference: 260, text_output_tokens: 1000 },
};
const SEEDREAM_PRO: AiModelPrice = {
  id: "s", modelId: "seedream:seedream-5-0-pro", effectiveFrom: "2026-01-01T00:00:00Z", sourceUrl: null, note: null,
  lines: [
    { meter: "output_image", unit_usd: 0.09, when: { size: "2K" } },
    { meter: "input_image", unit_usd: 0.003 },
  ],
  estimate: {},
};

describe("imageDims", () => {
  it("reads OpenAI's quality (auto and unset as high) and size from the aspect ratio", () => {
    expect(imageDims("openai:gpt-image-2", { quality: "auto", aspectRatio: "16:9" })).toEqual({ quality: "high", size: "1536x1024" });
    expect(imageDims("openai:gpt-image-2", {})).toEqual({ quality: "high", size: "1024x1024" });
  });
  it("reads the image size for every other provider, 1K when unset", () => {
    expect(imageDims("gemini:gemini-nano-banana-2.1", {})).toEqual({ size: "1K" });
    expect(imageDims("seedream:seedream-5-0-pro", { imageSize: "2K" })).toEqual({ size: "2K" });
  });
});

describe("imageEstimateUsd", () => {
  it("OpenAI, no references: the image, plus the base input as text", () => {
    expect(imageEstimateUsd(GPT, { modelId: GPT.modelId, quality: "medium", aspectRatio: "1:1", referenceCount: 0 }))
      .toBeCloseTo(0.053 + (190 * 5) / 1e6, 10);
  });
  it("OpenAI, with references: every input token at the image rate", () => {
    expect(imageEstimateUsd(GPT, { modelId: GPT.modelId, quality: "medium", aspectRatio: "1:1", referenceCount: 2 }))
      .toBeCloseTo(0.053 + ((190 + 2 * 1550) * 8) / 1e6, 10);
  });
  it("Gemini adds the text and thinking allowance", () => {
    expect(imageEstimateUsd(NANO, { modelId: NANO.modelId, imageSize: "1K", referenceCount: 1 }))
      .toBeCloseTo(0.0336 + ((180 + 260) * 1.5) / 1e6 + (1000 * 7.5) / 1e6, 10);
  });
  it("Seedream: the image, plus each reference after the first", () => {
    expect(imageEstimateUsd(SEEDREAM_PRO, { modelId: SEEDREAM_PRO.modelId, imageSize: "2K", referenceCount: 3 }))
      .toBeCloseTo(0.09 + 2 * 0.003, 10);
  });
  it("is null when the image has no price at these settings", () => {
    expect(imageEstimateUsd(NANO, { modelId: NANO.modelId, imageSize: "4K", referenceCount: 0 })).toBeNull();
  });
});

describe("imageChargeUsd", () => {
  const tokens = { text_input_tokens: 12, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 2143, text_output_tokens: 234, thought_tokens: 777 };

  it("prices the provider's tokens", () => {
    const c = imageChargeUsd(NANO, { tokens, billedImages: null });
    expect(c?.usd).toBeCloseTo((12 * 1.5 + 1120 * 30 + (234 + 777) * 7.5) / 1e6, 10);
    expect(c?.unpriced).toEqual([]);
    expect(c?.meters).toEqual(imageTokenMeters(tokens));
  });
  it("prices billed images by size", () => {
    expect(imageChargeUsd(SEEDREAM_PRO, { tokens: null, billedImages: { output_image: 1, input_image: 2, size: "2K" } })?.usd)
      .toBeCloseTo(0.096, 10);
  });
  it("lists token meters the row does not price, and is null with nothing to price", () => {
    expect(imageChargeUsd(GPT, { tokens, billedImages: null })?.unpriced).toEqual(["text_output_token", "thought_token"]);
    expect(imageChargeUsd(GPT, { tokens: null, billedImages: null })).toBeNull();
  });
});
