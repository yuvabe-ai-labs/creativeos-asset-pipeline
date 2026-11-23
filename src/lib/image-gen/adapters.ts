import "server-only";
import { generateWithOpenAI } from "./providers/openai";
import { generateWithGemini, generateWithGeminiInteractions } from "./providers/gemini";
import { generateWithSeedream, SEEDREAM_LITE, SEEDREAM_PRO, type SeedreamVariant } from "./providers/seedream";
import type { ImageAdapter } from "./types";

// D538 — the code that calls each image model's provider, by its catalog row's adapter_key. The
// model's data (params, limits, mask support) comes from the row; the provider's model name is
// the row's provider_model_id. Retired models (gpt-image-1) have no adapter: they cannot run.

const openai: ImageAdapter = (input, { providerModelId }) => generateWithOpenAI(providerModelId, input);
const gemini: ImageAdapter = (input, { providerModelId }) => generateWithGemini(providerModelId, input);
const geminiInteractions: ImageAdapter = (input, { providerModelId }) =>
  generateWithGeminiInteractions(providerModelId, input);
// Sizes and batch mode stay in code; only the dated model name comes from the row.
const seedream =
  (variant: SeedreamVariant): ImageAdapter =>
  (input, { providerModelId }) =>
    generateWithSeedream({ ...variant, arkModel: providerModelId }, input);

export const imageAdapters: Readonly<Record<string, ImageAdapter>> = {
  "image:gpt-image-2.5-sunburst": openai,
  "image:gpt-image-2.5-flare": openai,
  "image:gpt-image-2": openai,
  "image:gpt-image-1-mini": openai,
  "image:gemini-2.5-flash-image": gemini,
  "image:gemini-3.1-flash-image": gemini,
  "image:gemini-nano-banana-2.1": geminiInteractions,
  "image:gemini-3-pro-image": gemini,
  "image:seedream-5-0-lite": seedream(SEEDREAM_LITE),
  "image:seedream-5-0-pro": seedream(SEEDREAM_PRO),
};
