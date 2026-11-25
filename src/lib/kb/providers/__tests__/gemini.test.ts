import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const generateContent = vi.fn();
vi.mock("@/lib/gemini/server", () => ({ createGemini: () => ({ models: { generateContent } }) }));
vi.mock("@/lib/db/kb", () => ({ listKBDocuments: vi.fn(async () => []) }));
vi.mock("@/lib/kb/fill-rate", () => ({ computeFillRate: () => 0 }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { geminiMeters } from "@/lib/ai-models/text-usage";
import { geminiKBProvider } from "../gemini";

// D560 — the KB build runs in a task: each Gemini call's cost is recorded there, once.
const usage = { promptTokenCount: 1200, cachedContentTokenCount: 200, candidatesTokenCount: 300, thoughtsTokenCount: 50 };
const recordFor = { orgId: "org-1", clientId: "client-1" };
const expected = { ...recordFor, type: "kb", modelId: "gemini:gemini-3.1-pro-preview", meters: geminiMeters(usage) };

beforeEach(() => { generateContent.mockReset(); vi.mocked(recordProviderCost).mockReset(); });

describe("geminiKBProvider cost record", () => {
  it("records the extraction call once", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({}), usageMetadata: usage });
    await geminiKBProvider.extractKB({ clientId: "client-1", docIds: [], researchMarkdown: "# Brand", recordFor });
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject(expected);
    // Only Gemini's usage block, as is: never the documents, the answer or anything else.
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records the website research call once, as kb", async () => {
    generateContent.mockResolvedValue({ text: "## Research", usageMetadata: usage });
    await geminiKBProvider.researchWebsite("https://brand.example", recordFor);
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject(expected);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records a paid call whose answer was empty", async () => {
    generateContent.mockResolvedValue({ text: "", usageMetadata: usage });
    await expect(geminiKBProvider.researchWebsite("https://brand.example", recordFor)).rejects.toThrow("no content");
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
  });

  it("records nothing when Gemini fails, or when no one is named", async () => {
    generateContent.mockRejectedValue(new Error("HTTP 503"));
    await expect(geminiKBProvider.researchWebsite("https://brand.example", recordFor)).rejects.toThrow("503");
    await expect(geminiKBProvider.extractKB({ clientId: "client-1", docIds: [], researchMarkdown: "# Brand", recordFor })).rejects.toThrow("503");
    generateContent.mockResolvedValue({ text: "## Research", usageMetadata: usage });
    await geminiKBProvider.researchWebsite("https://brand.example");
    expect(recordProviderCost).not.toHaveBeenCalled();
  });
});
