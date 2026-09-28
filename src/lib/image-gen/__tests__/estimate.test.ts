import { describe, it, expect } from "vitest";
import { estimateImageGenerationCostUsd } from "../estimate";

describe("estimateImageGenerationCostUsd", () => {
  it("returns null when there is no output-cost entry for the model", () => {
    expect(
      estimateImageGenerationCostUsd({
        modelId: "unknown:model",
        quality: "medium",
        aspectRatio: "1:1",
        imageSize: undefined,
        referenceUrls: [],
      }),
    ).toBeNull();
  });

  it("sums output + input cost for an OpenAI model with one reference image", () => {
    // gpt-image-2 medium 1024x1024 output = 0.053 (OPENAI_IMAGE_ESTIMATE_TABLE).
    // 1 reference -> inputTokens = 190 + 1550 = 1740; imgIn rate $8/1M -> 0.01392.
    const result = estimateImageGenerationCostUsd({
      modelId: "openai:gpt-image-2",
      quality: "medium",
      aspectRatio: "1:1",
      imageSize: undefined,
      referenceUrls: ["https://example.com/ref.png"],
    });
    expect(result).toBeCloseTo(0.053 + 0.01392, 5);
  });

  it("sums output + input cost for a Gemini model with zero references", () => {
    // gemini-3.1-flash-image 1K output = 0.067 (GEMINI_IMAGE_ESTIMATE_TABLE).
    // 0 references -> inputTokens = 180; textIn rate $0.50/1M -> 0.00009.
    const result = estimateImageGenerationCostUsd({
      modelId: "gemini:gemini-3.1-flash-image",
      quality: undefined,
      aspectRatio: undefined,
      imageSize: "1K",
      referenceUrls: [],
    });
    expect(result).toBeCloseTo(0.067 + 0.00009, 5);
  });

  it("prices Seedream Pro per image plus each reference after the first", () => {
    // Pro 1.5K = 0.045; 3 references -> 2 extra x 0.003. No token-based input charge.
    const result = estimateImageGenerationCostUsd({
      modelId: "seedream:seedream-5-0-pro",
      quality: undefined,
      aspectRatio: "9:16",
      imageSize: "1.5K",
      referenceUrls: ["https://a", "https://b", "https://c"],
    });
    expect(result).toBeCloseTo(0.045 + 0.006, 6);
  });

  it("prices Seedream Lite flat, references free", () => {
    const result = estimateImageGenerationCostUsd({
      modelId: "seedream:seedream-5-0-lite",
      quality: undefined,
      aspectRatio: "9:16",
      imageSize: "4K",
      referenceUrls: ["https://a", "https://b"],
    });
    expect(result).toBeCloseTo(0.035, 6);
  });

  it("is synchronous — does not return a Promise", () => {
    const result = estimateImageGenerationCostUsd({
      modelId: "openai:gpt-image-2",
      quality: "medium",
      aspectRatio: "1:1",
      imageSize: undefined,
      referenceUrls: [],
    });
    expect(result).not.toBeInstanceOf(Promise);
  });
});
