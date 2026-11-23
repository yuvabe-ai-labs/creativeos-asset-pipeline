import "server-only";
import type { ImageGenInput, ImageGenResult } from "../types";

// Seedream 5.0 on BytePlus ModelArk (D285). Same host and key as Seedance
// (video-gen/providers/seedance.ts). Synchronous: one POST returns the image, no task to poll.
// Ref: ref/byteplus-docs/Image generation API.md, Seedream 5.0 pro and Lite tutorial.md.
const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

// Sizes are the vendor's published "resolution level x aspect ratio -> WxH" mapping
// (ref/byteplus-docs/Image generation API.md, `size`). The API would pick the same pixels from a
// resolution level plus a ratio described in the prompt; we send the explicit WxH instead so a 9:16
// reel is 9:16 whatever the prompt says. The resolution select's options on each catalog row are
// these tables' keys.
type SizeTable = Record<string, Record<string, string>>;

export const SEEDREAM_LITE_SIZES: SizeTable = {
  "2K": {
    "1:1": "2048x2048", "4:3": "2304x1728", "3:4": "1728x2304", "16:9": "2848x1600",
    "9:16": "1600x2848", "3:2": "2496x1664", "2:3": "1664x2496", "21:9": "3136x1344",
  },
  "3K": {
    "1:1": "3072x3072", "4:3": "3456x2592", "3:4": "2592x3456", "16:9": "4096x2304",
    "9:16": "2304x4096", "3:2": "3744x2496", "2:3": "2496x3744", "21:9": "4704x2016",
  },
  "4K": {
    "1:1": "4096x4096", "4:3": "4704x3520", "3:4": "3520x4704", "16:9": "5504x3040",
    "9:16": "3040x5504", "3:2": "4992x3328", "2:3": "3328x4992", "21:9": "6240x2656",
  },
};

export const SEEDREAM_PRO_SIZES: SizeTable = {
  "1K": {
    "1:1": "1024x1024", "4:3": "1152x864", "3:4": "864x1152", "16:9": "1424x800",
    "9:16": "800x1424", "3:2": "1248x832", "2:3": "832x1248", "21:9": "1568x672",
  },
  "1.5K": {
    "1:1": "1536x1536", "4:3": "1792x1344", "3:4": "1344x1792", "16:9": "2048x1152",
    "9:16": "1152x2048", "3:2": "1872x1248", "2:3": "1248x1872", "21:9": "2352x1008",
  },
  "2K": {
    "1:1": "2048x2048", "4:3": "2368x1776", "3:4": "1776x2368", "16:9": "2816x1584",
    "9:16": "1584x2816", "3:2": "2496x1664", "2:3": "1664x2496", "21:9": "3136x1344",
  },
};

/**
 * The vendor's WxH for a resolution level and aspect ratio. The select options are this table's
 * keys, so an unknown pair is a programmer error — it throws rather than guessing a size.
 */
export function seedreamSize(sizes: SizeTable, resolution: string, aspectRatio: string): string {
  const size = sizes[resolution]?.[aspectRatio];
  if (!size) throw new Error(`Seedream has no size for ${resolution} at ${aspectRatio}.`);
  return size;
}

/**
 * A Seedream variant's request settings. `arkModel` is a default for tests and builders; the
 * adapter always passes the catalog row's provider_model_id, and that is what runs (D545).
 */
export type SeedreamVariant = {
  arkModel: string;
  sizes: Record<string, Record<string, string>>;
  // Lite takes `sequential_image_generation`; Pro has no batch mode and rejects the field.
  supportsSequential: boolean;
};

export const SEEDREAM_LITE: SeedreamVariant = {
  arkModel: "seedream-5-0-lite-260128",
  sizes: SEEDREAM_LITE_SIZES,
  supportsSequential: true,
};

export const SEEDREAM_PRO: SeedreamVariant = {
  arkModel: "dola-seedream-5-0-pro-260628",
  sizes: SEEDREAM_PRO_SIZES,
  supportsSequential: false,
};

function getApiKey(): string {
  const key = process.env.BYTEPLUS_API_KEY;
  if (!key) throw new Error("BYTEPLUS_API_KEY is not set — Seedream cannot generate.");
  return key;
}

function resolutionOf(input: ImageGenInput): string {
  return String(input.params.image_size ?? "2K");
}

/** The request body, exported for tests. Pure — no network, no env. */
export function buildSeedreamRequest(
  variant: SeedreamVariant,
  input: ImageGenInput,
): Record<string, unknown> {
  const refs = input.referenceUrls;
  return {
    model: variant.arkModel,
    prompt: input.prompt,
    // Public storage URLs go as-is (the vendor fetches them). One ref is a string, several an array.
    ...(refs.length === 1 ? { image: refs[0] } : refs.length > 1 ? { image: refs } : {}),
    size: seedreamSize(variant.sizes, resolutionOf(input), String(input.params.aspect_ratio ?? "9:16")),
    output_format: "png",
    // Bytes straight to our storage — the `url` form expires after 24 hours.
    response_format: "b64_json",
    // The default stamps "AI-generated" in the corner.
    watermark: false,
    ...(variant.supportsSequential ? { sequential_image_generation: "disabled" } : {}),
  };
}

type ArkImageResponse = {
  data?: Array<{ b64_json?: string; error?: { code?: string; message?: string } }>;
  usage?: { output_tokens?: number; total_tokens?: number };
  error?: { code?: string; message?: string };
};

function truncate(s: string): string {
  return s.length > 500 ? `${s.slice(0, 500)}...` : s;
}

export async function generateWithSeedream(
  variant: SeedreamVariant,
  input: ImageGenInput,
): Promise<ImageGenResult> {
  // Masks are OpenAI-only; Seedream targets regions from the prompt text (D38), as Gemini does.
  const body = buildSeedreamRequest(variant, input);

  const res = await fetch(`${ARK_BASE}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: ArkImageResponse;
  try {
    json = JSON.parse(text) as ArkImageResponse;
  } catch {
    throw new Error(`Seedream request failed (${res.status}): ${truncate(text)}`);
  }

  // The vendor's message is the real diagnosis (model not activated, moderation, bad size) —
  // surfaced verbatim, as Seedance does.
  if (!res.ok || json.error) {
    const message = json.error?.message ?? truncate(text);
    throw new Error(`Seedream request failed (${res.status}): ${message}`);
  }

  const first = json.data?.[0];
  if (first?.error) {
    throw new Error(`Seedream could not generate the image: ${first.error.message ?? first.error.code}`);
  }
  if (!first?.b64_json) throw new Error("Seedream returned no image");

  const outputTokens = json.usage?.output_tokens ?? 0;
  return {
    imageBase64: first.b64_json,
    mimeType: "image/png",
    tokensUsed: {
      text_input_tokens:   0,
      image_input_tokens:  0,
      image_output_tokens: outputTokens,
      total_tokens:        json.usage?.total_tokens ?? outputTokens,
    },
    billedImages: {
      output_image: 1,
      input_image: Math.max(0, input.referenceUrls.length - 1),
      size: resolutionOf(input),
    },
  };
}
