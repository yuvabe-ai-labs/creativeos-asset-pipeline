import type { ZodTypeAny } from "zod";

export type ImageProvider = "openai" | "gemini";

export type ImageTokenUsage = {
  text_input_tokens: number;
  image_input_tokens: number;
  image_output_tokens: number;
  total_tokens: number;
};

export type ImageGenInput = {
  prompt: string;
  referenceUrls: string[];   // Supabase public URLs — never re-encoded to base64 for OpenAI
  params: Record<string, unknown>;
};

export type ImageGenResult = {
  imageBase64: string;       // raw bytes from provider, uploaded to Storage immediately
  mimeType: string;          // "image/png" | "image/jpeg" | "image/webp"
  tokensUsed: ImageTokenUsage;
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

// Server-side model config (includes generate function + derived Zod schema)
export type MediaGenModelSpec = {
  id:                    string;
  provider:              string;
  mediaType:             MediaType;
  label:                 string;
  providerLabel:         string;
  maxReferenceImages:    number;
  maxReferenceSizeBytes: number;
  supportsMask?:         boolean;   // model accepts an alpha edit-mask (OpenAI images.edit)
  params:                ParamSpec[];
  schema:                ZodTypeAny;
  generate:              (input: ImageGenInput) => Promise<ImageGenResult>;
};

// Client-safe subset (no generate function)
export type ClientModelSpec = Omit<MediaGenModelSpec, "generate">;

// Legacy alias — keeps existing imports in registry.ts and API routes compiling
export type ImageGenModelConfig = MediaGenModelSpec;
