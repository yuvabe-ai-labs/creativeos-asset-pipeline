// Client-safe model metadata + Zod schemas. Mirrors `registry.ts` but excludes
// the server-only `generate` functions so this can be imported from React
// components without dragging in the OpenAI / Gemini SDK code paths.

import { z, type ZodTypeAny } from "zod";

export type ImageGenClientModel = {
  id: string;
  provider: "openai" | "gemini";
  label: string;
  providerLabel: string;
  schema: ZodTypeAny;
  maxReferenceImages: number;
};

// ── OpenAI schemas (kept in sync with providers/openai.ts) ────────────────────

const gptImage2Schema = z.object({
  size: z
    .enum(["auto", "1024x1024", "1536x1024", "1024x1536"])
    .default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  background: z.enum(["auto", "opaque", "transparent"]).default("auto"),
  output_format: z.enum(["png", "jpeg", "webp"]).default("png"),
  output_compression: z.number().min(0).max(100).optional(),
});

const gptImage1Schema = gptImage2Schema;

const gptImage1MiniSchema = z.object({
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  output_format: z.enum(["png", "jpeg", "webp"]).default("png"),
  output_compression: z.number().min(0).max(100).optional(),
});

// ── Gemini schemas (kept in sync with providers/gemini.ts) ────────────────────

const geminiFlashImageSchema = z.object({
  aspect_ratio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"])
    .default("1:1"),
  image_size: z.enum(["512", "1K", "2K", "4K"]).default("1K"),
  safety_filter_level: z
    .enum(["block_low_and_above", "block_medium_and_above", "block_only_high"])
    .default("block_medium_and_above"),
  person_generation: z.enum(["allow_adult", "disallow"]).default("allow_adult"),
});

const geminiProImageSchema = z.object({
  aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
  image_size: z.enum(["1K", "2K", "4K"]).default("1K"),
  safety_filter_level: z
    .enum(["block_low_and_above", "block_medium_and_above", "block_only_high"])
    .default("block_medium_and_above"),
  person_generation: z.enum(["allow_adult", "disallow"]).default("allow_adult"),
  thinking_level: z.enum(["none", "low", "high"]).default("low"),
});

// ── Client model list ─────────────────────────────────────────────────────────

export const imageGenClientModels: ImageGenClientModel[] = [
  {
    id: "openai:gpt-image-2",
    provider: "openai",
    label: "GPT Image 2",
    providerLabel: "OpenAI",
    schema: gptImage2Schema,
    maxReferenceImages: 10,
  },
  {
    id: "openai:gpt-image-1",
    provider: "openai",
    label: "GPT Image 1",
    providerLabel: "OpenAI",
    schema: gptImage1Schema,
    maxReferenceImages: 10,
  },
  {
    id: "openai:gpt-image-1-mini",
    provider: "openai",
    label: "GPT Image 1 Mini",
    providerLabel: "OpenAI",
    schema: gptImage1MiniSchema,
    maxReferenceImages: 5,
  },
  {
    id: "gemini:gemini-3.1-flash-image-preview",
    provider: "gemini",
    label: "Nano Banana 2",
    providerLabel: "Gemini",
    schema: geminiFlashImageSchema,
    maxReferenceImages: 5,
  },
  {
    id: "gemini:gemini-3-pro-image-preview",
    provider: "gemini",
    label: "Nano Banana Pro",
    providerLabel: "Gemini",
    schema: geminiProImageSchema,
    maxReferenceImages: 5,
  },
];

export const imageGenClientModelMap: Record<string, ImageGenClientModel> =
  Object.fromEntries(imageGenClientModels.map((m) => [m.id, m]));

export const imageGenClientModelGroups: Array<{
  provider: "openai" | "gemini";
  label: string;
  models: ImageGenClientModel[];
}> = [
  {
    provider: "openai",
    label: "OpenAI",
    models: imageGenClientModels.filter((m) => m.provider === "openai"),
  },
  {
    provider: "gemini",
    label: "Gemini",
    models: imageGenClientModels.filter((m) => m.provider === "gemini"),
  },
];

export const DEFAULT_CLIENT_MODEL_ID = "openai:gpt-image-2";

// Extract default values from a Zod object schema (for resetting params form).

export function defaultsForSchema(schema: ZodTypeAny): Record<string, unknown> {
  const parsed = schema.safeParse({});
  if (parsed.success) return parsed.data as Record<string, unknown>;
  return {};
}
