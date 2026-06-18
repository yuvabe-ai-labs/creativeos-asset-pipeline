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

export type ImageGenModelConfig = {
  id: string;                // "openai:gpt-image-1" — used as model_used in node_versions
  provider: ImageProvider;
  apiModelId: string;        // actual string passed to provider API
  label: string;             // "GPT Image 1"
  providerLabel: string;     // "OpenAI" | "Gemini"
  schema: ZodTypeAny;        // validates params + drives react-hook-form
  maxReferenceImages: number;
  maxReferenceSizeBytes: number;
  generate: (input: ImageGenInput) => Promise<ImageGenResult>;
};
