// Client-safe model metadata. No generate functions — safe to import from React components.
// Params are imported from providers (single source of truth, no Zod duplication).

import { gptImage2Params, gptImage1Params, gptImage1MiniParams } from "./params/openai";
import { geminiFlashParams, geminiProParams } from "./params/gemini";
import { buildZodFromParams } from "./schema-builder";
import type { ClientModelSpec, ParamSpec } from "./types";

export type { ClientModelSpec };
// Legacy alias — remove once all consumers updated
export type ImageGenClientModel = ClientModelSpec;

// ── Client model list ─────────────────────────────────────────────────────────

export const imageGenClientModels: ClientModelSpec[] = [
  {
    id: "openai:gpt-image-2",
    provider: "openai", mediaType: "image",
    label: "GPT Image 2", providerLabel: "OpenAI",
    maxReferenceImages: 10, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage2Params,
    schema: buildZodFromParams(gptImage2Params),
  },
  {
    id: "openai:gpt-image-1",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1", providerLabel: "OpenAI",
    maxReferenceImages: 10, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage1Params,
    schema: buildZodFromParams(gptImage1Params),
  },
  {
    id: "openai:gpt-image-1-mini",
    provider: "openai", mediaType: "image",
    label: "GPT Image 1 Mini", providerLabel: "OpenAI",
    maxReferenceImages: 5, maxReferenceSizeBytes: 50 * 1024 * 1024,
    params: gptImage1MiniParams,
    schema: buildZodFromParams(gptImage1MiniParams),
  },
  {
    id: "gemini:gemini-2.5-flash-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiFlashParams,
    schema: buildZodFromParams(geminiFlashParams),
  },
  {
    id: "gemini:gemini-3.1-flash-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana 2", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiFlashParams,
    schema: buildZodFromParams(geminiFlashParams),
  },
  {
    id: "gemini:gemini-3-pro-image",
    provider: "gemini", mediaType: "image",
    label: "Nano Banana Pro", providerLabel: "Gemini",
    maxReferenceImages: 5, maxReferenceSizeBytes: 20 * 1024 * 1024,
    params: geminiProParams,
    schema: buildZodFromParams(geminiProParams),
  },
];

export const imageGenClientModelMap: Record<string, ClientModelSpec> =
  Object.fromEntries(imageGenClientModels.map((m) => [m.id, m]));

export const imageGenClientModelGroups: Array<{
  provider: string;
  label: string;
  models: ClientModelSpec[];
}> = [
  { provider: "openai", label: "OpenAI", models: imageGenClientModels.filter((m) => m.provider === "openai") },
  { provider: "gemini", label: "Gemini", models: imageGenClientModels.filter((m) => m.provider === "gemini") },
];

export const DEFAULT_CLIENT_MODEL_ID = "gemini:gemini-3.1-flash-image";

// Extract defaults from ParamSpec array (replaces defaultsForSchema)
export function defaultsForModel(model: ClientModelSpec): Record<string, unknown> {
  return Object.fromEntries(
    model.params
      .filter((p: ParamSpec) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p: ParamSpec) => [p.name, p.defaultValue]),
  );
}

// Legacy alias kept until image-gen-focus-view.tsx is updated
export function defaultsForSchema(schema: ClientModelSpec["schema"]): Record<string, unknown> {
  const parsed = schema.safeParse({});
  if (parsed.success) return parsed.data as Record<string, unknown>;
  return {};
}
