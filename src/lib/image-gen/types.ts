import type { ZodTypeAny } from "zod";
import type { BilledImages } from "@/lib/ai-models/image-price";

export type ImageProvider = "openai" | "gemini" | "seedream";

export type ImageTokenUsage = {
  text_input_tokens: number;
  image_input_tokens: number;
  image_output_tokens: number;
  total_tokens: number;
  /** D528 — Gemini only: the model's text output and its thinking, both billed at the text rate. */
  text_output_tokens?: number;
  thought_tokens?: number;
};

export type ImageGenInput = {
  prompt: string;
  referenceUrls: string[];   // Supabase public URLs — never re-encoded to base64 for OpenAI
  params: Record<string, unknown>;
  maskBase64?: string;       // OpenAI alpha edit-mask (base64 PNG), same size as the base image
  maskMime?: string;         // defaults to image/png
  providerMaxRetries?: number; // the provider client's own retries; unset keeps its default (D366: the image task passes 0)
};

export type ImageGenResult = {
  imageBase64: string;       // raw bytes from provider, uploaded to Storage immediately
  mimeType: string;          // "image/png" | "image/jpeg" | "image/webp"
  tokensUsed: ImageTokenUsage;
  /** D534 — providers billed per image (Seedream) report what they billed; the price row prices it. */
  billedImages?: BilledImages;
};

// ── Param manifest types ──────────────────────────────────────────────────────

export type ParamComponent = "select" | "slider" | "toggle" | "number" | "textarea";
export type ParamGroup = "primary" | "advanced";
export type MediaType = "image" | "video";

export type ParamConstraints =
  | { type: "select";   options: string[] }
  | { type: "slider";   min: number; max: number; step?: number }
  | { type: "toggle" }
  | { type: "number";   min?: number; max?: number; step?: number }
  | { type: "textarea"; maxLength?: number };

export type ParamSpec = {
  name:         string;
  label:        string;
  component:    ParamComponent;
  group:        ParamGroup;
  order:        number;          // sort order within group (lower = first, resets per group)
  visible:      boolean;         // false = sent to API with defaultValue, never shown in UI
  defaultValue: unknown;         // JSON-serializable → DB-ready
  constraints:  ParamConstraints;
  description?: string;
};

// A model's spec as the app reads it: the catalog row's data plus the Zod schema derived from its params.
export type MediaGenModelSpec = {
  id:                          string;
  provider:                    string;
  mediaType:                   MediaType;
  label:                       string;
  providerLabel:               string;
  maxReferenceImages:          number;
  maxReferenceSizeBytes:       number;
  maxTotalReferenceSizeBytes?: number;   // aggregate all images combined (Gemini: 100 MB)
  maxImageEdgePx?:             number;   // max pixels on either edge (OpenAI: 3840)
  maxAspectRatio?:             number;   // max long:short ratio (OpenAI: 3.0)
  minDimensionMultiple?:       number;   // both edges must be multiples of N (OpenAI: 16)
  supportsMask?:               boolean;   // model accepts an alpha edit-mask (OpenAI images.edit)
  params:                      ParamSpec[];
  schema:                      ZodTypeAny;
};

// Client-safe alias; the spec carries no server-only members.
export type ClientModelSpec = MediaGenModelSpec;

/** D538 — what an adapter is given besides the request: the catalog's spec and the provider's
 *  own name for the model (the row's provider_model_id). */
export type ImageAdapterContext = { spec: ClientModelSpec; providerModelId: string };
export type ImageAdapter = (input: ImageGenInput, ctx: ImageAdapterContext) => Promise<ImageGenResult>;
