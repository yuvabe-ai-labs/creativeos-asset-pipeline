import { KB_EXTRACT_SYSTEM_PROMPT } from "./kb-extract";

export const geminiKbExtractPrompt = {
  id: "gemini-kb-extract",
  version: "1.0.0",
  model: "gemini-3.1-pro-preview",
  system: KB_EXTRACT_SYSTEM_PROMPT,
} as const;
