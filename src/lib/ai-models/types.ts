// D552 — the AI model catalog, as the app reads it. Rows live in ai_models / ai_model_prices
// (migration 0076); src/lib/ai-models/schema.ts checks them on load. Client-safe.
import type { ParamSpec } from "@/lib/image-gen/types";
import type { ConstraintRule } from "@/lib/video-gen/types";

export const AI_MODEL_KINDS = [
  "image", "video", "edit", "voice", "dub", "lipsync", "transcribe", "text", "scrape",
] as const;
export type AiModelKind = (typeof AI_MODEL_KINDS)[number];

export const AI_MODEL_STATUSES = ["draft", "live", "hidden", "retired"] as const;
export type AiModelStatus = (typeof AI_MODEL_STATUSES)[number];

// D554 — what a provider bill and a price line are counted in.
export const METERS = [
  "input_token", "text_input_token", "image_input_token", "cached_input_token",
  "text_output_token", "thought_token", "image_output_token", "video_output_token",
  "output_image", "input_image", "video_second", "audio_second", "character",
  "provider_unit", "provider_credit", "usd", "request",
] as const;
export type Meter = (typeof METERS)[number];

export type AiModel = {
  id: string;
  provider: string;
  kind: AiModelKind;
  label: string;
  pickerLabel: string | null;
  providerLabel: string;
  description: string | null;
  status: AiModelStatus;
  replacedBy: string | null;
  sortOrder: number;
  adapterKey: string;
  providerModelId: string | null;
  params: ParamSpec[];
  rules: ConstraintRule[];
  capabilities: Record<string, unknown>;
  updatedAt: string;
};

/** D553 — one price line. `when` lists request params that must all match; none = any run. */
export type PriceLine = {
  meter: Meter;
  unit_usd: number;
  when?: Record<string, string | number | boolean>;
};

export type AiModelPrice = {
  id: string;
  modelId: string;
  effectiveFrom: string;
  lines: PriceLine[];
  /** Quantities added to the estimate only, e.g. { thought_token: 1500 }. */
  estimate: Record<string, number>;
  sourceUrl: string | null;
  note: string | null;
};

/** D554: what a provider reported for one run, as meters, and its own block verbatim. */
export type ProviderBill = {
  source: "provider_charge" | "provider_usage" | "request";
  meters: Partial<Record<Meter, number>>;
  raw?: unknown;
  /** Meters the provider reported that the price row had no line for; the run was charged another way. */
  unpriced?: Meter[];
};

/** D571 — how a run's cost becomes credits, from `effectiveFrom` on. A row is never edited. */
export type CreditSettings = {
  id: string;
  effectiveFrom: string;
  marginPercent: number;
  roundStep: 1 | 5 | 10;
  note: string | null;
};

export type AiCatalog = { models: AiModel[]; prices: AiModelPrice[]; creditSettings: CreditSettings[] };
