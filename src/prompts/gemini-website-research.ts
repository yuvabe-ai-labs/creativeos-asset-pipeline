import { GEMINI_WEBSITE_RESEARCH_SYSTEM_PROMPT } from "./website-research";

export const geminiWebsiteResearchPrompt = {
  id: "gemini-website-research",
  version: "1.0.0",
  model: "gemini-3.1-pro-preview",
  system: GEMINI_WEBSITE_RESEARCH_SYSTEM_PROMPT,
} as const;
