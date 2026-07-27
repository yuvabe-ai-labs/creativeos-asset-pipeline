import "server-only";
import { createGemini } from "@/lib/gemini/server";
import { buildZodFromParams } from "../schema-builder";
import { geminiFlashParams, gemini25FlashParams, geminiFlash2Params, geminiProParams } from "../params/gemini";
import type { ImageGenInput, ImageGenResult, MediaGenModelSpec } from "../types";

export { geminiFlashParams, gemini25FlashParams, geminiFlash2Params, geminiProParams };

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
  const promptTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
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

/**
 * Live pre-flight input-token count via Gemini's official countTokens endpoint — sends the
 * exact same `contents` shape generateWithGemini uses, so the count matches what a real
 * generation call would actually bill for input. Used by the pre-generation estimate
 * (design spec §5). Always a fresh live call, never cached.
 */
export async function countGeminiInputTokens(
  apiModelId: string,
  prompt: string,
  referenceUrls: string[],
): Promise<number> {
  const ai = createGemini();
  const refParts = await Promise.all(
    referenceUrls.map(async (url) => {
      const { mimeType, data } = await urlToInlineData(url);
      return { inlineData: { mimeType, data } };
    }),
  );
  const response = await ai.models.countTokens({
    model: apiModelId,
    contents: [{ role: "user", parts: [...refParts, { text: prompt }] }],
  });
  return response.totalTokens ?? 0;
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
