import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
const generateContent = vi.fn();
vi.mock("@/lib/gemini/server", () => ({ createGemini: () => ({ models: { generateContent } }) }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { geminiMeters } from "@/lib/ai-models/text-usage";
import { generateStructured } from "./gemini";

// D537 — image analysis runs in a task: each Gemini call's cost is recorded there, once.
const usage = { promptTokenCount: 1200, cachedContentTokenCount: 200, candidatesTokenCount: 300, thoughtsTokenCount: 50 };
const recordFor = { orgId: "org-1", clientId: "client-1", userId: "user-1" };
const call = { model: "gemini-3.5-flash-lite", system: "SYS", parts: [{ text: "x" }], schema: z.object({ a: z.number() }) };

beforeEach(() => { generateContent.mockReset(); vi.mocked(recordProviderCost).mockReset(); });

describe("generateStructured cost record", () => {
  it("records the call once, as image_analysis", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ a: 1 }), usageMetadata: usage });
    expect(await generateStructured({ ...call, recordFor })).toEqual({ a: 1 });
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({
      ...recordFor, type: "image_analysis", modelId: "gemini:gemini-3.5-flash-lite", meters: geminiMeters(usage),
    });
    // Only Gemini's usage block, as is: never the image, the answer or anything else.
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records nothing when Gemini fails, or when no one is named", async () => {
    generateContent.mockRejectedValue(new Error("HTTP 503"));
    await expect(generateStructured({ ...call, recordFor })).rejects.toThrow("503");
    generateContent.mockResolvedValue({ text: JSON.stringify({ a: 1 }), usageMetadata: usage });
    await generateStructured(call);
    expect(recordProviderCost).not.toHaveBeenCalled();
  });
});
