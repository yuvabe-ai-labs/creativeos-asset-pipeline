import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const parse = vi.fn();
const create = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { parse, create } }) }));
vi.mock("@/lib/db/kb", () => ({ listKBDocuments: vi.fn(async () => []) }));
vi.mock("@/lib/kb/fill-rate", () => ({ computeFillRate: () => 0 }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { kbExtractPrompt } from "@/prompts/kb-extract";
import { websiteResearchPrompt } from "@/prompts/website-research";
import { openaiKBProvider } from "../openai";

// D560 — the KB build runs in a task: each OpenAI call's cost is awaited there, once.
const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1500 };
const recordFor = { orgId: "org-1", clientId: "client-1" };
const meters = { input_token: 1000, cached_input_token: 200, text_output_token: 300 };

beforeEach(() => { parse.mockReset(); create.mockReset(); vi.mocked(recordProviderCost).mockReset(); });

describe("openaiKBProvider cost record", () => {
  it("records the extraction call once", async () => {
    parse.mockResolvedValue({ output_parsed: {}, usage });
    await openaiKBProvider.extractKB({ clientId: "client-1", docIds: [], researchMarkdown: "# Brand", recordFor });
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({ ...recordFor, type: "kb", modelId: `openai:${kbExtractPrompt.model}`, meters });
    // Only OpenAI's usage block, as is: never the documents, the answer or anything else.
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records the website research call once, as kb", async () => {
    create.mockResolvedValue({ output_text: "## Research", usage });
    await openaiKBProvider.researchWebsite("https://brand.example", recordFor);
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({ ...recordFor, type: "kb", modelId: `openai:${websiteResearchPrompt.model}`, meters });
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records a paid call whose answer was empty", async () => {
    create.mockResolvedValue({ output_text: "", usage });
    await expect(openaiKBProvider.researchWebsite("https://brand.example", recordFor)).rejects.toThrow("no content");
    parse.mockResolvedValue({ output_parsed: null, usage });
    await expect(openaiKBProvider.extractKB({ clientId: "client-1", docIds: [], researchMarkdown: null, recordFor })).rejects.toThrow("no parsed output");
    expect(recordProviderCost).toHaveBeenCalledTimes(2);
  });

  it("records nothing when OpenAI fails, or when no one is named", async () => {
    create.mockRejectedValue(new Error("HTTP 503"));
    parse.mockRejectedValue(new Error("HTTP 503"));
    await expect(openaiKBProvider.researchWebsite("https://brand.example", recordFor)).rejects.toThrow("503");
    await expect(openaiKBProvider.extractKB({ clientId: "client-1", docIds: [], researchMarkdown: null, recordFor })).rejects.toThrow("503");
    create.mockResolvedValue({ output_text: "## Research", usage });
    await openaiKBProvider.researchWebsite("https://brand.example");
    expect(recordProviderCost).not.toHaveBeenCalled();
  });
});
