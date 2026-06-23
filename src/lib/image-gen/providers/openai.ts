import "server-only";
import { createOpenAI } from "@/lib/openai/server";
import { buildZodFromParams } from "../schema-builder";
import { gptImage2Params, gptImage1Params, gptImage1MiniParams } from "../params/openai";
import type { ImageGenInput, ImageGenResult, MediaGenModelSpec } from "../types";

export { gptImage2Params, gptImage1Params, gptImage1MiniParams };

// Params ref: https://platform.openai.com/docs/api-reference/images/create

// ── Helpers ───────────────────────────────────────────────────────────────────

async function urlToFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${url}`);
  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  return new File([buffer], `reference.${ext}`, { type: contentType });
}

// ── Generate function ─────────────────────────────────────────────────────────

async function generateWithOpenAI(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const openai = createOpenAI();
  const p = input.params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharedParams: Record<string, any> = {
    model: apiModelId,
    n: 1,
    size: (p.size as string) ?? "1024x1024",
    quality: (p.quality as string) ?? "medium",
    // response_format is NOT supported for gpt-image-* models — they always return b64_json
  };
  if (p.background)    sharedParams.background    = p.background;
  if (p.output_format) sharedParams.output_format = p.output_format;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let response: any;

  if (input.referenceUrls.length > 0) {
    const imageFiles = await Promise.all(input.referenceUrls.map(urlToFile));
    response = await openai.images.edit({
      ...sharedParams,
      prompt: input.prompt,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
    });
  } else {
    response = await openai.images.generate({
      ...sharedParams,
      prompt: input.prompt,
    });
  }

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = response.usage as any;
  return {
    imageBase64: b64,
    mimeType:
      p.output_format === "jpeg" ? "image/jpeg"
      : p.output_format === "webp" ? "image/webp"
      : "image/png",
    tokensUsed: {
      text_input_tokens:   usage?.input_tokens_details?.text_tokens  ?? usage?.input_tokens  ?? 0,
      image_input_tokens:  usage?.input_tokens_details?.image_tokens ?? 0,
      image_output_tokens: usage?.output_tokens ?? 0,
      total_tokens:        usage?.total_tokens  ?? 0,
    },
  };
}

// ── Model configs ─────────────────────────────────────────────────────────────

export const openaiModels: MediaGenModelSpec[] = [
  {
    id: "openai:gpt-image-2",
    provider: "openai", mediaType: "image",
    label: "GPT Image 2", providerLabel: "OpenAI",
    maxReferenceImages: 10, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage2Params,
    schema: buildZodFromParams(gptImage2Params),
    generate: (input) => generateWithOpenAI("gpt-image-2", input),
  },
  {
    id: "openai:gpt-image-1",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1", providerLabel: "OpenAI",
    maxReferenceImages: 10, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage1Params,
    schema: buildZodFromParams(gptImage1Params),
    generate: (input) => generateWithOpenAI("gpt-image-1", input),
  },
  {
    id: "openai:gpt-image-1-mini",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1 Mini", providerLabel: "OpenAI",
    maxReferenceImages: 5, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage1MiniParams,
    schema: buildZodFromParams(gptImage1MiniParams),
    generate: (input) => generateWithOpenAI("gpt-image-1-mini", input),
  },
];
