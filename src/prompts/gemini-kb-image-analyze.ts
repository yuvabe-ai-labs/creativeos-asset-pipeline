import { KB_IMAGE_ANALYZE_SYSTEM_PROMPT } from "./kb-image-analyze";

export const geminiKbImageAnalyzePrompt = {
  id: "gemini-kb-image-analyze",
  version: "1.0.0",
  model: "gemini-2.5-flash",
  system: KB_IMAGE_ANALYZE_SYSTEM_PROMPT,
} as const;
