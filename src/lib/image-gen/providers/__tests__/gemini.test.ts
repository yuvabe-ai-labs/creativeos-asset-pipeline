import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContent = vi.fn();
const interactionsCreate = vi.fn();
vi.mock("@/lib/gemini/server", () => ({
  createGemini: () => ({ models: { generateContent }, interactions: { create: interactionsCreate } }),
}));

import { imageAdapters } from "../../adapters";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { toImageClientSpec } from "@/lib/ai-models/to-spec";

// Each model runs the way a task runs it: its catalog row's adapter, with the row's model name.
const generate = (id: string) => {
  const row = seededModelCatalog().models.find((m) => m.id === id)!;
  return imageAdapters[row.adapterKey](
    { prompt: "a mug", referenceUrls: [], params: {} },
    { spec: toImageClientSpec(row), providerModelId: row.providerModelId! },
  );
};

beforeEach(() => vi.clearAllMocks());

// Usage blocks below are real responses captured 2026-10-10. The image's own token count is what
// Google prices per image; the totals around it also count the model's text output.
describe("Gemini image token usage", () => {
  it("bills generateContent models on the IMAGE modality, not candidatesTokenCount", async () => {
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: "aW1n", mimeType: "image/png" } }] } }],
      usageMetadata: {
        promptTokenCount: 14, candidatesTokenCount: 1213, totalTokenCount: 1354,
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }], thoughtsTokenCount: 127,
      },
    });
    const result = await generate("gemini:gemini-3-pro-image");
    expect(result.tokensUsed?.image_output_tokens).toBe(1120);
    expect(result.tokensUsed?.text_input_tokens).toBe(14);
  });

  // D528 — Google bills the model's text and thinking at the text output rate.
  it("records the text and thinking a generateContent model produced", async () => {
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: "aW1n", mimeType: "image/png" } }] } }],
      usageMetadata: {
        promptTokenCount: 14, candidatesTokenCount: 1213, totalTokenCount: 1354,
        candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }], thoughtsTokenCount: 127,
      },
    });
    const result = await generate("gemini:gemini-3-pro-image");
    expect(result.tokensUsed?.text_output_tokens).toBe(93);
    expect(result.tokensUsed?.thought_tokens).toBe(127);
  });

  it("falls back to candidatesTokenCount when no breakdown is returned", async () => {
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { data: "aW1n" } }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1290 },
    });
    const result = await generate("gemini:gemini-2.5-flash-image");
    expect(result.tokensUsed?.image_output_tokens).toBe(1290);
    expect(result.tokensUsed?.text_output_tokens).toBe(0);
    expect(result.tokensUsed?.thought_tokens).toBe(0);
  });

  it("bills Nano Banana 2.1 on the image modality, not total_output_tokens", async () => {
    interactionsCreate.mockResolvedValue({
      status: "completed",
      output_image: { data: "aW1n", mime_type: "image/jpeg" },
      usage: {
        total_input_tokens: 38, total_output_tokens: 1411, total_tokens: 2124,
        output_tokens_by_modality: [{ modality: "image", tokens: 1120 }], total_thought_tokens: 675,
      },
    });
    const result = await generate("gemini:gemini-nano-banana-2.1");
    expect(result.tokensUsed?.image_output_tokens).toBe(1120);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.tokensUsed?.text_output_tokens).toBe(291);
    expect(result.tokensUsed?.thought_tokens).toBe(675);
  });

  it("fails an interaction that did not complete", async () => {
    interactionsCreate.mockResolvedValue({ status: "failed" });
    await expect(generate("gemini:gemini-nano-banana-2.1")).rejects.toThrow('status "failed"');
  });
});
