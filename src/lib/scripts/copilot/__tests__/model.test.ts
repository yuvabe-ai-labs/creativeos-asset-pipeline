import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
const parse = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { parse } }) }));
const generateContent = vi.fn();
vi.mock("@/lib/gemini/server", () => ({ createGemini: () => ({ models: { generateContent } }) }));

import { structuredCaller } from "../model";

const schema = z.object({ reply: z.string() });
const args = { name: "probe", system: "SYS", user: "USER", schema };

beforeEach(() => { parse.mockReset(); generateContent.mockReset(); });

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
});
