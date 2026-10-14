import "server-only";
import { createGemini } from "@/lib/gemini/server";
import { buildZodFromParams } from "../schema-builder";
import { gemini25FlashParams, geminiFlash2Params, geminiNanoBanana21Params, geminiProParams } from "../params/gemini";
import type { ImageGenInput, ImageGenResult, MediaGenModelSpec } from "../types";

export { gemini25FlashParams, geminiFlash2Params, geminiNanoBanana21Params, geminiProParams };

// Params ref: https://ai.google.dev/gemini-api/docs/image-generation
// Only imageConfig.aspectRatio and imageConfig.imageSize are supported via the
// Gemini Developer API.

// ── Helpers ───────────────────────────────────────────────────────────────────

async function urlToInlineData(url: string): Promise<{ mimeType: string; data: string }> {
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
  // masks are OpenAI-only; Gemini does region targeting via prompt text (D38). input.maskBase64
  // is intentionally ignored here.
  const ai = createGemini();
  const p = input.params;

  const refParts = await Promise.all(
    input.referenceUrls.map(async (url) => {
      const { mimeType, data } = await urlToInlineData(url);
      return { inlineData: { mimeType, data } };
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (ai.models as any).generateContent({
    model: apiModelId,
    contents: [{ role: "user", parts: [...refParts, { text: input.prompt }] }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: p.aspect_ratio ?? "1:1",
        imageSize:   p.image_size   ?? "1K",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((pt: { inlineData?: { data?: string } }) => pt.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini returned no image in response");
  }

  const usage = response?.usageMetadata;
  // promptTokenCount covers all input (text + reference images combined).
  // Gemini doesn't break out text vs image input separately, so map the
  // full prompt count to text_input_tokens and leave image_input_tokens at 0.
  // candidatesTokenCount also counts the model's text output, which on Gemini 3 image models
  // varies per call. Billed at the image rate it over-charged: staging rows for
  // gemini-3-pro-image at 1K ran 1211-1640 against Google's fixed 1120 per image. The image's
  // own count comes from the per-modality breakdown.
  const promptTokens = usage?.promptTokenCount ?? 0;
  const outputTokens =
    usage?.candidatesTokensDetails?.find((d: { modality?: string }) => d.modality === "IMAGE")?.tokenCount ??
    usage?.candidatesTokenCount ?? 0;
  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? "image/png",
    tokensUsed: {
      text_input_tokens:   promptTokens,
      image_input_tokens:  0,
      image_output_tokens: outputTokens,
      total_tokens:        usage?.totalTokenCount ?? (promptTokens + outputTokens),
    },
  };
}

// Nano Banana 2.1 is served through the Interactions API only, not generateContent
// (https://ai.google.dev/gemini-api/docs/image-generation). Same contract as above: images
// first, the prompt text last, one image back.
async function generateWithGeminiInteractions(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const ai = createGemini();
  const p = input.params;

  const refImages = await Promise.all(
    input.referenceUrls.map(async (url) => {
      const { mimeType, data } = await urlToInlineData(url);
      return { type: "image" as const, mime_type: mimeType, data };
    }),
  );

  const interaction = await ai.interactions.create({
    model: apiModelId,
    input: [...refImages, { type: "text", text: input.prompt }],
    response_format: {
      type: "image",
      aspect_ratio: (p.aspect_ratio as string | undefined) ?? "1:1",
      image_size:   (p.image_size   as string | undefined) ?? "1K",
    },
    // Each generation is one-shot; nothing reads the interaction back later.
    store: false,
  });

  if (interaction.status !== "completed") {
    throw new Error(`Gemini interaction ended with status "${interaction.status}"`);
  }
  const image = interaction.output_image;
  if (!image?.data) throw new Error("Gemini returned no image in response");

  // Like generateContent, the input count is text + images combined (one published rate).
  // total_output_tokens also counts the model's text, so the image's own count is read from the
  // per-modality breakdown (measured: 1120 for a 1K image, Google's published figure).
  const usage = interaction.usage;
  const inputTokens  = usage?.total_input_tokens ?? 0;
  const outputTokens =
    usage?.output_tokens_by_modality?.find((m) => m.modality === "image")?.tokens ??
    usage?.total_output_tokens ?? 0;
  return {
    imageBase64: image.data,
    mimeType: image.mime_type ?? "image/png",
    tokensUsed: {
      text_input_tokens:   inputTokens,
      image_input_tokens:  0,
      image_output_tokens: outputTokens,
      total_tokens:        usage?.total_tokens ?? (inputTokens + outputTokens),
    },
  };
}

// ── Model configs ─────────────────────────────────────────────────────────────

export const geminiModels: MediaGenModelSpec[] = [
  {
    id: "gemini:gemini-2.5-flash-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana", providerLabel: "Gemini",
    maxReferenceImages: 14, maxReferenceSizeBytes: 0,
    maxTotalReferenceSizeBytes: 100 * 1024 * 1024,
    params: gemini25FlashParams,
    schema: buildZodFromParams(gemini25FlashParams),
    generate: (input) => generateWithGemini("gemini-2.5-flash-image", input),
  },
  {
    id: "gemini:gemini-3.1-flash-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana 2", providerLabel: "Gemini",
    maxReferenceImages: 14, maxReferenceSizeBytes: 0,
    maxTotalReferenceSizeBytes: 100 * 1024 * 1024,
    params: geminiFlash2Params,
    schema: buildZodFromParams(geminiFlash2Params),
    generate: (input) => generateWithGemini("gemini-3.1-flash-image", input),
  },
  {
    id: "gemini:gemini-nano-banana-2.1",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana 2.1", providerLabel: "Gemini",
    maxReferenceImages: 14, maxReferenceSizeBytes: 0,
    maxTotalReferenceSizeBytes: 100 * 1024 * 1024,
    params: geminiNanoBanana21Params,
    schema: buildZodFromParams(geminiNanoBanana21Params),
    generate: (input) => generateWithGeminiInteractions("gemini-nano-banana-2.1", input),
  },
  {
    id: "gemini:gemini-3-pro-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana Pro", providerLabel: "Gemini",
    maxReferenceImages: 14, maxReferenceSizeBytes: 0,
    maxTotalReferenceSizeBytes: 100 * 1024 * 1024,
    params: geminiProParams,
    schema: buildZodFromParams(geminiProParams),
    generate: (input) => generateWithGemini("gemini-3-pro-image", input),
  },
];
