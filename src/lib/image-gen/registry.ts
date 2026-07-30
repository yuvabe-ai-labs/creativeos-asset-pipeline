import type { MediaGenModelSpec } from "./types";
import { openaiModels } from "./providers/openai";
import { geminiModels } from "./providers/gemini";

const allModels: MediaGenModelSpec[] = [...openaiModels, ...geminiModels];

export const imageGenRegistry: Record<string, MediaGenModelSpec> = Object.fromEntries(
  allModels.map((m) => [m.id, m]),
);

export const imageGenModelGroups: Array<{
  provider: string;
  label: string;
  models: MediaGenModelSpec[];
}> = [
  { provider: "openai", label: "OpenAI", models: openaiModels },
  { provider: "gemini", label: "Gemini", models: geminiModels },
];

export const DEFAULT_MODEL_ID = "gemini:gemini-3-pro-image";
