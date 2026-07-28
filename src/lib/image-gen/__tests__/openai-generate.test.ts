import { describe, it, expect, vi, beforeEach } from "vitest";

const imagesGenerate = vi.fn();

vi.mock("@/lib/openai/server", () => ({
  createOpenAI: () => ({
    images: { generate: imagesGenerate },
  }),
}));

import { generateWithOpenAI } from "../providers/openai";
import type { ImageGenInput } from "../types";

beforeEach(() => {
  imagesGenerate.mockReset();
  imagesGenerate.mockResolvedValue({
    data: [{ b64_json: "abc123" }],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  });
});

function baseInput(params: Record<string, unknown>): ImageGenInput {
  return {
    prompt: "a red ball on a white background",
    referenceUrls: [],
    params,
  };
}

describe("generateWithOpenAI — transparent background + jpeg output", () => {
  it("overrides output_format to png when background is transparent and output_format is jpeg", async () => {
    await generateWithOpenAI(
      "gpt-image-2",
      baseInput({ background: "transparent", output_format: "jpeg", aspect_ratio: "1:1", quality: "medium" }),
    );
    expect(imagesGenerate).toHaveBeenCalledTimes(1);
    expect(imagesGenerate.mock.calls[0][0].output_format).toBe("png");
  });

  it("leaves output_format untouched when background is opaque", async () => {
    await generateWithOpenAI(
      "gpt-image-2",
      baseInput({ background: "opaque", output_format: "jpeg", aspect_ratio: "1:1", quality: "medium" }),
    );
    expect(imagesGenerate.mock.calls[0][0].output_format).toBe("jpeg");
  });

  it("leaves output_format untouched when transparent is paired with png", async () => {
    await generateWithOpenAI(
      "gpt-image-2",
      baseInput({ background: "transparent", output_format: "png", aspect_ratio: "1:1", quality: "medium" }),
    );
    expect(imagesGenerate.mock.calls[0][0].output_format).toBe("png");
  });
});
