import "server-only";
import { createOpenAI } from "@/lib/openai/server";
import { websiteResearchPrompt } from "@/prompts/website-research";

export async function researchBrandWebsite(url: string): Promise<string> {
  const openai = createOpenAI();
  const res = await openai.responses.create({
    model: websiteResearchPrompt.model,
    input: [
      { role: "system", content: websiteResearchPrompt.system },
      { role: "user", content: `Brand website: ${url}` },
    ],
    tools: [{ type: "web_search" }],
  });
  const md = res.output_text?.trim();
  if (!md) throw new Error(`Website research returned no content for ${url}`);
  return md;
}
