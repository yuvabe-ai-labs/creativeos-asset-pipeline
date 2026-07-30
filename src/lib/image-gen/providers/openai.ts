import "server-only";
import sharp from "sharp";
import { createOpenAI } from "@/lib/openai/server";
import { buildZodFromParams } from "../schema-builder";
import { gptImage2Params, gptImage1Params, gptImage1MiniParams } from "../params/openai";
import type { ImageGenInput, ImageGenResult, MediaGenModelSpec } from "../types";

export { gptImage2Params, gptImage1Params, gptImage1MiniParams };

// Params ref: https://platform.openai.com/docs/api-reference/images/create

// Model used ONLY for the input-token-counting call in countOpenAIInputTokens below — NOT an
// image generation model (gpt-image-2/gpt-image-1/-mini aren't valid Responses-API models,
// and responses.inputTokens.count() requires a Responses-API model). OpenAI's docs confirm
// `model` is required but give no guidance for this specific case: image generation never
// goes through the Responses API, so there is no "real" model to match, unlike every other
// documented use of this endpoint. Reuses this app's existing default OpenAI text model
// (src/prompts/prompt-generate.ts) as a pragmatic choice, confirmed to work (no error) via a
// live diagnostic probe on 2026-07-25 — not confirmed correct for vision-token accuracy by
// any source. Revisit if OpenAI ever publishes clearer guidance for this case.
const TOKEN_COUNTING_MODEL = "gpt-5.4-mini";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function urlToFile(url: string): Promise<{ file: File; width: number; height: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log("[urlToFile] fetched reference image", { url, bytes: buffer.length });
  const normalized = await normalizeReferenceImageForOpenAI(buffer);
  // Detect format from the re-encoded bytes, not the (sometimes wrong/generic) response
  // content-type header — normalizeReferenceImageForOpenAI always re-encodes to png/jpeg/webp.
  const meta = await sharp(normalized).metadata();
  const ext = meta.format === "jpeg" ? "jpg" : meta.format === "webp" ? "webp" : "png";
  const contentType = ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  console.log("[urlToFile] normalized reference image", {
    url,
    width: meta.width,
    height: meta.height,
    format: meta.format,
    bytes: normalized.length,
  });
  return {
    file: new File([new Uint8Array(normalized)], `reference.${ext}`, { type: contentType }),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

// Mirrors the maxAspectRatio/maxImageEdgePx/minDimensionMultiple values declared on all three
// OpenAI model configs below — kept as separate constants because this runs before a specific
// model is known to urlToFile's caller chain, not because the values are expected to diverge.
const MAX_ASPECT_RATIO = 3.0;
const MAX_EDGE_PX = 3840;
const DIMENSION_MULTIPLE = 16;

function floorToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.floor(value / multiple) * multiple);
}

// Guarantees every reference image sent to OpenAI satisfies its aspect-ratio, max-edge, and
// multiple-of-16 dimension requirements — unconditionally, so it can't be bypassed the way
// pre-flight validation can be when dimension metadata isn't known (see ADR D91).
export async function normalizeReferenceImageForOpenAI(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  // EXIF orientation 5-8 means a 90°/270° rotation is applied on display — the image's LOGICAL
  // width/height (what our crop/downscale/round math must reason about) are swapped relative to
  // the physical pixel dimensions sharp reports by default.
  const swapsDimensions = meta.orientation !== undefined && meta.orientation >= 5;
  let width = (swapsDimensions ? meta.height : meta.width) ?? 0;
  let height = (swapsDimensions ? meta.width : meta.height) ?? 0;
  console.log("[normalizeReferenceImageForOpenAI] input", {
    rawWidth: meta.width,
    rawHeight: meta.height,
    orientation: meta.orientation,
    swapsDimensions,
    logicalWidth: width,
    logicalHeight: height,
    format: meta.format,
    hasAlpha: meta.hasAlpha,
  });
  if (width === 0 || height === 0) {
    console.log("[normalizeReferenceImageForOpenAI] missing dimensions — skipping normalization");
    return buffer;
  }

  // .rotate() with no args auto-orients from the EXIF tag and bakes the rotation into the
  // pixels, then strips the tag — so the output is correctly oriented with no dangling metadata.
  let pipeline = sharp(buffer).rotate();

  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long / short > MAX_ASPECT_RATIO) {
    const newLong = Math.round(short * MAX_ASPECT_RATIO);
    console.log("[normalizeReferenceImageForOpenAI] aspect ratio exceeds max — cropping", {
      ratio: long / short,
      maxAspectRatio: MAX_ASPECT_RATIO,
      before: { width, height },
    });
    if (width >= height) {
      pipeline = pipeline.extract({ left: Math.floor((width - newLong) / 2), top: 0, width: newLong, height });
      width = newLong;
    } else {
      pipeline = pipeline.extract({ left: 0, top: Math.floor((height - newLong) / 2), width, height: newLong });
      height = newLong;
    }
    console.log("[normalizeReferenceImageForOpenAI] cropped", { after: { width, height } });
  }

  const maxEdge = Math.max(width, height);
  const scale = maxEdge > MAX_EDGE_PX ? MAX_EDGE_PX / maxEdge : 1;
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);
  if (scale !== 1) {
    console.log("[normalizeReferenceImageForOpenAI] max edge exceeded — downscaling", {
      maxEdge,
      maxEdgePx: MAX_EDGE_PX,
      scale,
      before: { width, height },
      after: { scaledWidth, scaledHeight },
    });
  }

  // Floor the short side first, then cap the long side at shortFinal * MAX_ASPECT_RATIO —
  // flooring both sides independently can push the ratio above MAX_ASPECT_RATIO even when the
  // pre-rounding ratio was exactly at the limit (a 16px loss is a much bigger relative change
  // on the short side than the long side).
  const isWidthLong = scaledWidth >= scaledHeight;
  const scaledLong = isWidthLong ? scaledWidth : scaledHeight;
  const scaledShort = isWidthLong ? scaledHeight : scaledWidth;

  const shortFinal = floorToMultiple(scaledShort, DIMENSION_MULTIPLE);
  const maxLongAllowed = shortFinal * MAX_ASPECT_RATIO;
  const longFinal = Math.min(floorToMultiple(scaledLong, DIMENSION_MULTIPLE), maxLongAllowed);

  const finalWidth = isWidthLong ? longFinal : shortFinal;
  const finalHeight = isWidthLong ? shortFinal : longFinal;

  console.log("[normalizeReferenceImageForOpenAI] final dimension check", {
    before: { width, height },
    finalWidth,
    finalHeight,
    dimensionMultiple: DIMENSION_MULTIPLE,
    willResize: finalWidth !== width || finalHeight !== height,
  });

  if (finalWidth !== width || finalHeight !== height) {
    pipeline = pipeline.resize({ width: finalWidth, height: finalHeight, fit: "fill" });
  }

  const outFormat =
    meta.hasAlpha ? "png"
    : meta.format === "webp" ? "webp"
    : meta.format === "jpeg" ? "jpeg"
    : "png";
  pipeline =
    outFormat === "png" ? pipeline.png()
    : outFormat === "webp" ? pipeline.webp()
    : pipeline.jpeg();

  const out = await pipeline.toBuffer();
  console.log("[normalizeReferenceImageForOpenAI] output", {
    outputFormat: outFormat,
    outputBytes: out.length,
    finalWidth,
    finalHeight,
  });
  return out;
}

// ── Aspect ratio → pixel size mapping ────────────────────────────────────────

const ASPECT_RATIO_TO_OPENAI_SIZE: Record<string, string> = {
  "1:1":  "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:3":  "1536x1024",
  "3:4":  "1024x1536",
  "21:9": "1536x1024",
  "4:1":  "1536x1024",
  "1:4":  "1024x1536",
};

export function aspectRatioToOpenAISize(ratio: string): string {
  return ASPECT_RATIO_TO_OPENAI_SIZE[ratio] ?? "1024x1024";
}

// Build the OpenAI edit `mask` File from the base64 the client painted, resized (if needed) to
// match the base image's final dimensions — OpenAI requires the mask and the first image to be
// the same size, and normalizeReferenceImageForOpenAI can change the base image's dimensions
// (see ADR D91). Returns undefined when no mask was sent (whole-image edit).
export async function maskFileFromInput(
  input: Pick<ImageGenInput, "maskBase64" | "maskMime">,
  targetDimensions?: { width: number; height: number },
): Promise<File | undefined> {
  if (!input.maskBase64) return undefined;
  const mime = input.maskMime ?? "image/png";
  let bytes: Buffer = Buffer.from(input.maskBase64, "base64");
  if (targetDimensions) {
    const meta = await sharp(bytes).metadata();
    const needsResize = meta.width !== targetDimensions.width || meta.height !== targetDimensions.height;
    console.log("[maskFileFromInput] mask dimension check", {
      maskWidth: meta.width,
      maskHeight: meta.height,
      targetDimensions,
      needsResize,
    });
    if (needsResize) {
      bytes = await sharp(bytes)
        .resize({ width: targetDimensions.width, height: targetDimensions.height, fit: "fill" })
        .png()
        .toBuffer();
      console.log("[maskFileFromInput] resized mask to match target dimensions", targetDimensions);
    }
  }
  return new File([new Uint8Array(bytes)], "mask.png", { type: mime });
}

// ── Generate function ─────────────────────────────────────────────────────────

export async function generateWithOpenAI(
  apiModelId: string,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const openai = createOpenAI();
  const p = input.params;

  // Server-side migration: params saved before the aspect_ratio field existed may carry a
  // legacy "size" string (e.g. "1024x1024"). Map it back to a ratio so the API receives
  // the correct pixel dimensions even for old nodes.
  const SIZE_TO_RATIO: Record<string, string> = {
    "1024x1024": "1:1",
    "1536x1024": "16:9",
    "1024x1536": "9:16",
    "auto":      "1:1",
  };
  const aspectRatio =
    (p.aspect_ratio as string | undefined) ??
    SIZE_TO_RATIO[p.size as string] ??
    "1:1";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharedParams: Record<string, any> = {
    model: apiModelId,
    n: 1,
    size: aspectRatioToOpenAISize(aspectRatio),
    quality: (p.quality as string) ?? "medium",
    // response_format is NOT supported for gpt-image-* models — they always return b64_json
  };
  if (p.background)    sharedParams.background    = p.background;
  if (p.output_format) sharedParams.output_format = p.output_format;

  // Transparent backgrounds require an alpha-capable output format — JPEG has none. OpenAI
  // rejects this combination outright (observed in prod, see ADR D91); auto-correct rather
  // than block the user.
  if (sharedParams.background === "transparent" && sharedParams.output_format === "jpeg") {
    sharedParams.output_format = "png";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let response: any;

  if (input.referenceUrls.length > 0) {
    const referenceFiles = await Promise.all(input.referenceUrls.map(urlToFile));
    const imageFiles = referenceFiles.map((r) => r.file);
    // The mask is painted client-side at the base image's original size, before this
    // normalization pass can change it — resize the mask to match so it still satisfies
    // OpenAI's "mask must match the first image's dimensions" requirement (see ADR D91).
    const mask = await maskFileFromInput(input, referenceFiles[0]);
    response = await openai.images.edit({
      ...sharedParams,
      prompt: input.prompt,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      ...(mask ? { mask } : {}),
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
      sharedParams.output_format === "jpeg" ? "image/jpeg"
      : sharedParams.output_format === "webp" ? "image/webp"
      : "image/png",
    tokensUsed: {
      text_input_tokens:   usage?.input_tokens_details?.text_tokens  ?? usage?.input_tokens  ?? 0,
      image_input_tokens:  usage?.input_tokens_details?.image_tokens ?? 0,
      image_output_tokens: usage?.output_tokens ?? 0,
      total_tokens:        usage?.total_tokens  ?? 0,
    },
  };
}

/**
 * Live pre-flight input-token count via OpenAI's official token-counting endpoint
 * (`responses.inputTokens.count`) — handles text-only and text+reference-image requests in
 * one call. Used by the pre-generation estimate (design spec §5). One inference, not a
 * directly confirmed 1:1 mapping to the Images API's own billing (see the design spec) —
 * worth a real-world sanity check once implemented, same as noted there. Passes
 * TOKEN_COUNTING_MODEL (see its own comment above) — the endpoint requires a model but this
 * request is never actually sent to it, so the choice is a pragmatic default, not a
 * documented answer. Always a fresh live call, never cached.
 */
export async function countOpenAIInputTokens(
  prompt: string,
  referenceUrls: string[],
): Promise<number> {
  const openai = createOpenAI();
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; detail: "auto"; image_url: string }
  > = [{ type: "input_text", text: prompt }];
  for (const url of referenceUrls) {
    content.push({ type: "input_image", detail: "auto", image_url: url });
  }
  const response = await openai.responses.inputTokens.count({
    model: TOKEN_COUNTING_MODEL,
    input: [{ role: "user", content }],
  });
  return response.input_tokens ?? 0;
}

// ── Model configs ─────────────────────────────────────────────────────────────

export const openaiModels: MediaGenModelSpec[] = [
  {
    id: "openai:gpt-image-2",
    provider: "openai", mediaType: "image",
    label: "GPT Image 2", providerLabel: "OpenAI",
    maxReferenceImages: 16, maxReferenceSizeBytes: 50 * 1024 * 1024,
    maxImageEdgePx: 3840,
    maxAspectRatio: 3.0,
    minDimensionMultiple: 16,
    supportsMask: true,
    params: gptImage2Params,
    schema: buildZodFromParams(gptImage2Params),
    generate: (input) => generateWithOpenAI("gpt-image-2", input),
  },
  {
    id: "openai:gpt-image-1",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1", providerLabel: "OpenAI",
    maxReferenceImages: 16, maxReferenceSizeBytes: 50 * 1024 * 1024,
    maxImageEdgePx: 3840,
    maxAspectRatio: 3.0,
    minDimensionMultiple: 16,
    supportsMask: true,
    params: gptImage1Params,
    schema: buildZodFromParams(gptImage1Params),
    generate: (input) => generateWithOpenAI("gpt-image-1", input),
  },
  {
    id: "openai:gpt-image-1-mini",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1 Mini", providerLabel: "OpenAI",
    maxReferenceImages: 16, maxReferenceSizeBytes: 50 * 1024 * 1024,
    maxImageEdgePx: 3840,
    maxAspectRatio: 3.0,
    minDimensionMultiple: 16,
    supportsMask: true,
    params: gptImage1MiniParams,
    schema: buildZodFromParams(gptImage1MiniParams),
    generate: (input) => generateWithOpenAI("gpt-image-1-mini", input),
  },
];
