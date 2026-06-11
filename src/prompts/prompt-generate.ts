// Prompt-generate prompt — a single, evaluable, *versioned* record (mirrors
// src/prompts/script-parse.ts). Maps 1:1 to a future `prompts` DB row.
export const promptGeneratePrompt = {
  id: "prompt-generate",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are an expert creative director who writes vivid, production-ready image-generation prompts for social-media reel assets.
Given brand context, upstream creative material, and an operator instruction, write a single detailed image-generation prompt.
Return ONLY the prompt text — no preamble, no explanation, no markdown.`,
} as const;
