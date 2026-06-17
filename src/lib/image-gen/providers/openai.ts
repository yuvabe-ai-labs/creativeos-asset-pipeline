import "server-only";
import { z } from "zod";
import { createOpenAI } from "@/lib/openai/server";
import type { ImageGenInput, ImageGenModelConfig, ImageGenResult } from "../types";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const gptImage2Schema = z.object({
  size: z.enum(["auto", "1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  background: z.enum(["auto", "opaque", "transparent"]).default("auto"),
  output_format: z.enum(["png", "jpeg", "webp"]).default("png"),
  // only shown in form when output_format is jpeg or webp
  output_compression: z.number().min(0).max(100).optional(),
});

// gpt-image-1 exposes identical params to gpt-image-2
export const gptImage1Schema = gptImage2Schema;

export const gptImage1MiniSchema = z.object({
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  output_format: z.enum(["png", "jpeg", "webp"]).default("png"),
  output_compression: z.number().min(0).max(100).optional(),
});

// ── Generate function (shared by all three OpenAI image models) ───────────────

async function generateWithOpenAI(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const openai = createOpenAI();
  const p = input.params;

  // Build input: plain string for text-only, array for multimodal (with refs)
  type InputItem =
    | { type: "input_image"; image_url: string }
    | { type: "input_text"; text: string };

  const inputPayload: string | InputItem[] =
    input.referenceUrls.length > 0
      ? [
          ...input.referenceUrls.map(
            (url): InputItem => ({ type: "input_image", image_url: url }),
          ),
          { type: "input_text", text: input.prompt },
        ]
      : input.prompt;

  // Tool params — only include optional keys when present
  const toolParams: Record<string, unknown> = {
    type: "image_generation",
    size: p.size ?? "1024x1024",
    quality: p.quality ?? "medium",
  };
  if (p.background)          toolParams.background = p.background;
  if (p.output_format)       toolParams.output_format = p.output_format;
  if (p.output_compression != null) toolParams.output_compression = p.output_compression;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.responses as any).create({
    model: apiModelId,
    input: inputPayload,
    tools: [toolParams],
  });

  // Extract the image_generation_call output item
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageOutput = (response.output as any[]).find(
    (o: { type: string }) => o.type === "image_generation_call",
  ) as { result: string } | undefined;

  if (!imageOutput?.result) {
    throw new Error("OpenAI returned no image in response output");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = response.usage as any;
  return {
    imageBase64: imageOutput.result,
    mimeType:
      p.output_format === "jpeg"
        ? "image/jpeg"
        : p.output_format === "webp"
          ? "image/webp"
          : "image/png",
    tokensUsed: {
      text_input_tokens:   usage?.input_tokens_details?.text_tokens  ?? 0,
      image_input_tokens:  usage?.input_tokens_details?.image_tokens ?? 0,
      image_output_tokens: usage?.output_tokens_details?.image_tokens ?? usage?.output_tokens ?? 0,
      total_tokens:        usage?.total_tokens ?? 0,
    },
  };
}

// ── Model configs ─────────────────────────────────────────────────────────────

export const openaiModels: ImageGenModelConfig[] = [
  {
    id: "openai:gpt-image-2",
    provider: "openai",
    apiModelId: "gpt-image-2",
    label: "GPT Image 2",
    providerLabel: "OpenAI",
    schema: gptImage2Schema,
    maxReferenceImages: 10,
    maxReferenceSizeBytes: 50 * 1024 * 1024,
    generate: (input) => generateWithOpenAI("gpt-image-2", input),
  },
  {
    id: "openai:gpt-image-1",
    provider: "openai",
    apiModelId: "gpt-image-1",
    label: "GPT Image 1",
    providerLabel: "OpenAI",
    schema: gptImage1Schema,
    maxReferenceImages: 10,
    maxReferenceSizeBytes: 50 * 1024 * 1024,
    generate: (input) => generateWithOpenAI("gpt-image-1", input),
  },
  {
    id: "openai:gpt-image-1-mini",
    provider: "openai",
    apiModelId: "gpt-image-1-mini",
    label: "GPT Image 1 Mini",
    providerLabel: "OpenAI",
    schema: gptImage1MiniSchema,
    maxReferenceImages: 5,
    maxReferenceSizeBytes: 50 * 1024 * 1024,
    generate: (input) => generateWithOpenAI("gpt-image-1-mini", input),
  },
];
