import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
const parse = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { parse } }) }));
const generateContent = vi.fn();
const generateContentStream = vi.fn();
vi.mock("@/lib/gemini/server", () => ({ createGemini: () => ({ models: { generateContent, generateContentStream } }) }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));
// `after` only runs inside a real request; here it records what was scheduled.
vi.mock("next/server", () => ({ after: vi.fn() }));

import { after } from "next/server";
import { recordProviderCost } from "@/lib/generations/record-cost";
import { geminiMeters } from "@/lib/ai-models/text-usage";
import { streamingCaller, structuredCaller } from "../model";

const schema = z.object({ reply: z.string() });
const args = { name: "probe", system: "SYS", user: "USER", schema };

beforeEach(() => {
  parse.mockReset(); generateContent.mockReset(); generateContentStream.mockReset();
  vi.mocked(after).mockReset(); vi.mocked(recordProviderCost).mockReset();
});

describe("structuredCaller", () => {
  it("calls OpenAI's structured output for an OpenAI model and validates the result", async () => {
    parse.mockResolvedValue({ output_parsed: { reply: "hi" } });
    expect(await structuredCaller("gpt-5.4-mini")(args)).toEqual({ reply: "hi" });
    const call = parse.mock.calls[0][0];
    expect(call.model).toBe("gpt-5.4-mini");
    expect(call.input).toEqual([{ role: "system", content: "SYS" }, { role: "user", content: "USER" }]);
    expect(call.text.format.name).toBe("probe");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("calls Gemini's JSON output for a Gemini model and validates the result", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ reply: "hi" }) });
    expect(await structuredCaller("gemini-3.8-flash")(args)).toEqual({ reply: "hi" });
    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-3.8-flash");
    expect(call.config.systemInstruction).toBe("SYS");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema).toBeTruthy();
  });

  it("asks Gemini to think less when told to, and leaves the default otherwise", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ reply: "hi" }) });
    await structuredCaller("gemini-3.1-pro-preview", { thinking: "low" })(args);
    expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    await structuredCaller("gemini-3.1-pro-preview")(args);
    expect(generateContent.mock.calls[1][0].config.thinkingConfig).toBeUndefined();
  });

  it("fails loudly on an empty or malformed answer", async () => {
    parse.mockResolvedValue({ output_parsed: null });
    await expect(structuredCaller("gpt-5.4-mini")(args)).rejects.toThrow("returned no content");
    generateContent.mockResolvedValue({ text: JSON.stringify({ nope: 1 }) });
    await expect(structuredCaller("gemini-3.8-flash")(args)).rejects.toThrow();
  });

  it("streams a Gemini answer, reporting the text so far, then validates the whole", async () => {
    async function* chunks() { yield { text: "{\"reply\":" }; yield { text: " \"hi\"}" }; }
    generateContentStream.mockResolvedValue(chunks());
    const seen: string[] = [];
    expect(await streamingCaller("gemini-3.1-pro-preview")(args, (t) => seen.push(t))).toEqual({ reply: "hi" });
    expect(seen).toEqual(["{\"reply\":", "{\"reply\": \"hi\"}"]);
  });

  it("falls back to one call for an OpenAI model, reporting the whole text once", async () => {
    parse.mockResolvedValue({ output_parsed: { reply: "hi" } });
    const seen: string[] = [];
    expect(await streamingCaller("gpt-5.4-mini")(args, (t) => seen.push(t))).toEqual({ reply: "hi" });
    expect(seen).toEqual([JSON.stringify({ reply: "hi" })]);
  });
});

// D537 — each Gemini call records what it cost us, once, after the response.
describe("cost record", () => {
  const usage = { promptTokenCount: 1200, cachedContentTokenCount: 200, candidatesTokenCount: 300, thoughtsTokenCount: 50 };
  const recordFor = { orgId: "org-1", clientId: "client-1", userId: "user-1", scriptId: "script-1" };
  const opts = { recordFor, recordType: "script" as const };
  const runScheduled = async () => { for (const [task] of vi.mocked(after).mock.calls) await (typeof task === "function" ? task() : task); };
  const expected = { ...recordFor, type: "script", modelId: "gemini:gemini-3.1-pro-preview", meters: geminiMeters(usage) };

  it("hands one record to after() as a promise, so it survives a closed response", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ reply: "hi" }), usageMetadata: usage });
    await structuredCaller("gemini-3.1-pro-preview", opts)(args);
    expect(after).toHaveBeenCalledTimes(1);
    // The promise form: waitUntil tracks it, with no wait for the response to close.
    expect(typeof vi.mocked(after).mock.calls[0][0]).not.toBe("function");
    await runScheduled();
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject(expected);
    // Only Gemini's usage block, as is: never the answer, the prompt or anything else.
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records a paid call whose answer then fails to parse", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ nope: 1 }), usageMetadata: usage });
    await expect(structuredCaller("gemini-3.1-pro-preview", opts)(args)).rejects.toThrow();
    await runScheduled();
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
  });

  it("records nothing when Gemini fails, or when no one is named", async () => {
    generateContent.mockRejectedValue(new Error("HTTP 503"));
    await expect(structuredCaller("gemini-3.1-pro-preview", opts)(args)).rejects.toThrow("503");
    generateContent.mockResolvedValue({ text: JSON.stringify({ reply: "hi" }), usageMetadata: usage });
    await structuredCaller("gemini-3.1-pro-preview")(args);
    expect(after).not.toHaveBeenCalled();
  });

  it("records a stream once, from the last chunk that carries usage", async () => {
    async function* chunks() {
      yield { text: "{\"reply\":", usageMetadata: { promptTokenCount: 1200 } };
      yield { text: " \"hi\"}", usageMetadata: usage };
      yield { text: "" };
    }
    generateContentStream.mockResolvedValue(chunks());
    expect(await streamingCaller("gemini-3.1-pro-preview", opts)(args, () => {})).toEqual({ reply: "hi" });
    expect(after).toHaveBeenCalledTimes(1);
    await runScheduled();
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject(expected);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("still records what arrived when the stream breaks or the reader goes away", async () => {
    async function* broken() { yield { text: "{", usageMetadata: usage }; throw new Error("socket hang up"); }
    generateContentStream.mockResolvedValue(broken());
    await expect(streamingCaller("gemini-3.1-pro-preview", opts)(args, () => {})).rejects.toThrow("socket");
    async function* fine() { yield { text: "{", usageMetadata: usage }; yield { text: "}" }; }
    generateContentStream.mockResolvedValue(fine());
    await expect(streamingCaller("gemini-3.1-pro-preview", opts)(args, () => { throw new Error("closed"); })).rejects.toThrow("closed");
    expect(after).toHaveBeenCalledTimes(2);
    await runScheduled();
    expect(recordProviderCost).toHaveBeenCalledTimes(2);
  });

  it("records nothing for a stream that never started or carried no usage", async () => {
    generateContentStream.mockRejectedValue(new Error("HTTP 429"));
    await expect(streamingCaller("gemini-3.1-pro-preview", opts)(args, () => {})).rejects.toThrow("429");
    async function* bare() { yield { text: JSON.stringify({ reply: "hi" }) }; }
    generateContentStream.mockResolvedValue(bare());
    await streamingCaller("gemini-3.1-pro-preview", opts)(args, () => {});
    expect(after).not.toHaveBeenCalled();
  });
});
