import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";

const imagesGenerate = vi.fn();
const imagesEdit = vi.fn();

vi.mock("@/lib/openai/server", () => ({
  createOpenAI: () => ({
    images: { generate: imagesGenerate, edit: imagesEdit },
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
  imagesEdit.mockReset();
  imagesEdit.mockResolvedValue({
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

  it("returns mimeType matching the corrected output_format, not the original", async () => {
    const result = await generateWithOpenAI(
      "gpt-image-2",
      baseInput({ background: "transparent", output_format: "jpeg", aspect_ratio: "1:1", quality: "medium" }),
    );
    expect(result.mimeType).toBe("image/png");
  });
});

describe("generateWithOpenAI — mask resized to match the normalized base image", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resizes the painted mask so it matches the base image's normalized dimensions", async () => {
    // Base image at 2001x999 — not a multiple of 16 on either edge, so normalization changes
    // its dimensions. The mask is painted client-side at this SAME natural size (matching how
    // the annotation canvas sizes its overlay from the image's naturalWidth/naturalHeight),
    // before normalization ever runs — reproducing the real edit flow.
    const baseImageBuffer = await sharp({
      create: { width: 2001, height: 999, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();
    const maskBuffer = await sharp({
      create: { width: 2001, height: 999, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => Uint8Array.from(baseImageBuffer).buffer,
      }),
    );

    await generateWithOpenAI("gpt-image-2", {
      prompt: "make the sky blue",
      referenceUrls: ["https://example.com/base.png"],
      params: { aspect_ratio: "1:1", quality: "medium" },
      maskBase64: maskBuffer.toString("base64"),
      maskMime: "image/png",
    });

    expect(imagesEdit).toHaveBeenCalledTimes(1);
    const call = imagesEdit.mock.calls[0][0];
    const imageFile = call.image as File;
    const maskFile = call.mask as File;

    const imageBytes = Buffer.from(await imageFile.arrayBuffer());
    const maskBytes = Buffer.from(await maskFile.arrayBuffer());
    const imageMeta = await sharp(imageBytes).metadata();
    const maskMeta = await sharp(maskBytes).metadata();

    // Base image was normalized down from 2001x999 (both non-multiples of 16) to 2000x992.
    expect(imageMeta.width).toBe(2000);
    expect(imageMeta.height).toBe(992);
    // The mask must match the base image's FINAL (normalized) dimensions exactly — OpenAI
    // requires the mask and the first image to be the same size.
    expect(maskMeta.width).toBe(imageMeta.width);
    expect(maskMeta.height).toBe(imageMeta.height);
  });
});
