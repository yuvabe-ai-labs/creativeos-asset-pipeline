import "server-only";
import { buildZodFromParams } from "../schema-builder";
import { seedreamImageCostUsd } from "../cost";
import {
  SEEDREAM_LITE_SIZES,
  SEEDREAM_PRO_SIZES,
  seedreamLiteParams,
  seedreamProParams,
  seedreamSize,
} from "../params/seedream";
import type { ImageGenInput, ImageGenResult, MediaGenModelSpec } from "../types";

// Seedream 5.0 on BytePlus ModelArk (D285). Same host and key as Seedance
// (video-gen/providers/seedance.ts). Synchronous: one POST returns the image, no task to poll.
// Ref: ref/byteplus-docs/Image generation API.md, Seedream 5.0 pro and Lite tutorial.md.
const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

/**
 * Our id (persisted on nodes and version rows) vs the vendor's dated model string, which lives
 * only here — a vendor bump is a one-line edit, not a migration of saved nodes.
 */
export type SeedreamVariant = {
  id: string;
  arkModel: string;
  sizes: Record<string, Record<string, string>>;
  // Lite takes `sequential_image_generation`; Pro has no batch mode and rejects the field.
  supportsSequential: boolean;
};

export const SEEDREAM_LITE: SeedreamVariant = {
  id: "seedream:seedream-5-0-lite",
  arkModel: "seedream-5-0-lite-260128",
  sizes: SEEDREAM_LITE_SIZES,
  supportsSequential: true,
};

export const SEEDREAM_PRO: SeedreamVariant = {
  id: "seedream:seedream-5-0-pro",
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
    costUsd: seedreamImageCostUsd(variant.id, resolutionOf(input), input.referenceUrls.length) ?? undefined,
  };
}

// ── Model configs ─────────────────────────────────────────────────────────────

const SHARED = {
  provider: "seedream",
  mediaType: "image",
  providerLabel: "Seedream",
  maxReferenceSizeBytes: 30 * 1024 * 1024,
  maxAspectRatio: 16,
  supportsMask: false,
} as const;

export const seedreamModels: MediaGenModelSpec[] = [
  {
    ...SHARED,
    id: SEEDREAM_LITE.id,
    label: "Seedream 5.0 Lite",
    maxReferenceImages: 14,
    params: seedreamLiteParams,
    schema: buildZodFromParams(seedreamLiteParams),
    generate: (input) => generateWithSeedream(SEEDREAM_LITE, input),
  },
  {
    ...SHARED,
    id: SEEDREAM_PRO.id,
    label: "Seedream 5.0 Pro",
    maxReferenceImages: 10,
    params: seedreamProParams,
    schema: buildZodFromParams(seedreamProParams),
    generate: (input) => generateWithSeedream(SEEDREAM_PRO, input),
  },
];
