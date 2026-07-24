import { describe, it, expect } from "vitest";
import { computeImageCost, estimateImageOutputCost } from "../cost";

describe("computeImageCost", () => {
  it("returns null for unknown model", () => {
    const result = computeImageCost("unknown:model", {
      text_input_tokens: 0, image_input_tokens: 0,
      image_output_tokens: 0, total_tokens: 0,
    });
    expect(result).toBeNull();
  });

  it("computes gpt-image-1 output-only cost", () => {
    // 1M image output tokens at $40/M
    const result = computeImageCost("openai:gpt-image-1", {
      text_input_tokens: 0, image_input_tokens: 0,
      image_output_tokens: 1_000_000, total_tokens: 1_000_000,
    });
    expect(result?.usd).toBeCloseTo(40.00, 2);
    expect(result?.inr).toBeCloseTo(40.00 * 95.77, 1);
  });

  it("computes gpt-image-1-mini mixed cost", () => {
    // 100k text-in ($2/M) + 50k img-in ($2.50/M) + 200k img-out ($8/M)
    const result = computeImageCost("openai:gpt-image-1-mini", {
      text_input_tokens: 100_000,
      image_input_tokens: 50_000,
      image_output_tokens: 200_000,
      total_tokens: 350_000,
    });
    const expected = (100_000 / 1e6) * 2.00 + (50_000 / 1e6) * 2.50 + (200_000 / 1e6) * 8.00;
    expect(result?.usd).toBeCloseTo(expected, 4);
  });

  it("computes gemini flash cost (image-out only)", () => {
    // 1120 output tokens = 1K image at $60/M
    const result = computeImageCost("gemini:gemini-3.1-flash-image", {
      text_input_tokens: 0, image_input_tokens: 0,
      image_output_tokens: 1_120, total_tokens: 1_120,
    });
    expect(result?.usd).toBeCloseTo((1_120 / 1e6) * 60.00, 6);
  });
});

describe("estimateImageOutputCost", () => {
  it("returns null for an unknown model", () => {
    expect(estimateImageOutputCost("unknown:model", "medium", "1024x1024")).toBeNull();
  });

  it("looks up an exact OpenAI quality/size cell", () => {
    expect(estimateImageOutputCost("openai:gpt-image-2", "medium", "1024x1024")).toBeCloseTo(0.053, 4);
    expect(estimateImageOutputCost("openai:gpt-image-1", "low", "1024x1536")).toBeCloseTo(0.016, 4);
  });

  it("treats quality \"auto\" as \"high\" (no published auto price)", () => {
    expect(estimateImageOutputCost("openai:gpt-image-2", "auto", "1024x1024")).toBeCloseTo(0.211, 4);
    expect(estimateImageOutputCost("openai:gpt-image-2", "auto", "1024x1024")).toBe(
      estimateImageOutputCost("openai:gpt-image-2", "high", "1024x1024"),
    );
  });

  it("returns null for a size not offered by that model", () => {
    expect(estimateImageOutputCost("openai:gpt-image-2", "medium", "1792x1024")).toBeNull();
  });

  it("looks up a flat Gemini size cell (no quality axis)", () => {
    expect(estimateImageOutputCost("gemini:gemini-2.5-flash-image", undefined, "1K")).toBeCloseTo(0.039, 4);
    expect(estimateImageOutputCost("gemini:gemini-3.1-flash-image", undefined, "2K")).toBeCloseTo(0.101, 4);
  });

  it("prices gemini-3-pro-image's 1K and 2K identically, 4K differently", () => {
    expect(estimateImageOutputCost("gemini:gemini-3-pro-image", undefined, "1K")).toBeCloseTo(0.134, 4);
    expect(estimateImageOutputCost("gemini:gemini-3-pro-image", undefined, "2K")).toBeCloseTo(0.134, 4);
    expect(estimateImageOutputCost("gemini:gemini-3-pro-image", undefined, "4K")).toBeCloseTo(0.24, 4);
  });
});
