import "server-only";
import { z } from "zod";
import { createGemini } from "@/lib/gemini/server";
import type { ImageGenInput, ImageGenModelConfig, ImageGenResult } from "../types";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const geminiFlashImageSchema = z.object({
  aspect_ratio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"])
    .default("1:1"),
  image_size: z.enum(["512", "1K", "2K", "4K"]).default("1K"),
  safety_filter_level: z
    .enum(["block_low_and_above", "block_medium_and_above", "block_only_high"])
    .default("block_medium_and_above"),
  person_generation: z.enum(["allow_adult", "disallow"]).default("allow_adult"),
});

export const geminiProImageSchema = z.object({
  aspect_ratio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
    .default("1:1"),
  image_size: z.enum(["1K", "2K", "4K"]).default("1K"),
  safety_filter_level: z
    .enum(["block_low_and_above", "block_medium_and_above", "block_only_high"])
    .default("block_medium_and_above"),
  person_generation: z.enum(["allow_adult", "disallow"]).default("allow_adult"),
  thinking_level: z.enum(["none", "low", "high"]).default("low"),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Gemini's Developer API does not accept arbitrary HTTP URLs as image input.
// Fetch the image server-side and pass as inline base64 data.
async function urlToInlineData(
  url: string,
): Promise<{ mimeType: string; data: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${url}`);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return { mimeType, data: Buffer.from(buffer).toString("base64") };
}

// ── Generate function ─────────────────────────────────────────────────────────

async function generateWithGemini(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const ai = createGemini();
  const p = input.params;

  // Fetch reference images as inline data (Gemini needs base64, not URLs)
  const refParts = await Promise.all(
    input.referenceUrls.map(async (url) => {
      const { mimeType, data } = await urlToInlineData(url);
      return { inlineData: { mimeType, data } };
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (ai.models as any).generateContent({
    model: apiModelId,
    contents: [
      {
        role: "user",
        parts: [...refParts, { text: input.prompt }],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio:   p.aspect_ratio  ?? "1:1",
        imageSize:     p.image_size    ?? "1K",
      },
      ...(p.thinking_level ? { thinkingConfig: { thinkingBudget: p.thinking_level } } : {}),
    },
  });

  // Extract image part from first candidate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((pt: { inlineData?: { data?: string } }) => pt.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini returned no image in response");
  }

  const usage = response?.usageMetadata;
  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
    tokensUsed: {
      text_input_tokens:   0,
      image_input_tokens:  0,
      image_output_tokens: usage?.candidatesTokenCount ?? 0,
      total_tokens:        usage?.totalTokenCount      ?? 0,
    },
  };
}

// ── Model configs ─────────────────────────────────────────────────────────────

export const geminiModels: ImageGenModelConfig[] = [
  {
    id: "gemini:gemini-2.5-flash-image",
    provider: "gemini",
    apiModelId: "gemini-2.5-flash-image",
    label: "Nano Banana ",
    providerLabel: "Gemini",
    schema: geminiFlashImageSchema,
    maxReferenceImages: 5,
    maxReferenceSizeBytes: 20 * 1024 * 1024,
    generate: (input) => generateWithGemini("gemini-2.5-flash-image", input),
  },
  {
    id: "gemini:gemini-3.1-flash-image-preview",
    provider: "gemini",
    apiModelId: "gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    providerLabel: "Gemini",
    schema: geminiFlashImageSchema,
    maxReferenceImages: 5,
    maxReferenceSizeBytes: 20 * 1024 * 1024,
    generate: (input) => generateWithGemini("gemini-3.1-flash-image-preview", input),
  },
  {
    id: "gemini:gemini-3-pro-image-preview",
    provider: "gemini",
    apiModelId: "gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    providerLabel: "Gemini",
    schema: geminiProImageSchema,
    maxReferenceImages: 5,
    maxReferenceSizeBytes: 20 * 1024 * 1024,
    generate: (input) => generateWithGemini("gemini-3-pro-image-preview", input),
  },
];
