import type { ImageGenModelConfig } from "./types";
import { openaiModels } from "./providers/openai";
import { geminiModels } from "./providers/gemini";

const allModels: ImageGenModelConfig[] = [...openaiModels, ...geminiModels];

export const imageGenRegistry: Record<string, ImageGenModelConfig> = Object.fromEntries(
  allModels.map((m) => [m.id, m]),
);

export const imageGenModelGroups: Array<{
  provider: string;
  label: string;
  models: ImageGenModelConfig[];
}> = [
  { provider: "openai", label: "OpenAI", models: openaiModels },
  { provider: "gemini", label: "Gemini", models: geminiModels },
];

export const DEFAULT_MODEL_ID = "openai:gpt-image-2";
