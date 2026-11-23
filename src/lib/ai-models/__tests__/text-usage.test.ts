import { describe, expect, it } from "vitest";
import { apifyMeters, geminiMeters, openAiChatMeters, openAiResponsesMeters } from "../text-usage";

describe("openAiChatMeters", () => {
  it("splits uncached input, cached input and output", () => {
    expect(
      openAiChatMeters({ prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 400 } }),
    ).toEqual({ input_token: 600, cached_input_token: 400, text_output_token: 200 });
  });
  it("clamps cached above the prompt to the prompt", () => {
    expect(
      openAiChatMeters({ prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 500 } }),
    ).toEqual({ input_token: 0, cached_input_token: 100, text_output_token: 5 });
  });
  it("has no cached meter when details are missing or null", () => {
    expect(openAiChatMeters({ prompt_tokens: 10, completion_tokens: 2 })).toEqual({ input_token: 10, text_output_token: 2 });
    expect(openAiChatMeters({ prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: null })).toEqual({
      input_token: 10,
      text_output_token: 2,
    });
  });
});

describe("openAiResponsesMeters", () => {
  it("maps input_tokens, cached details and output_tokens (reasoning is already in output)", () => {
    const usage = {
      input_tokens: 1000,
      output_tokens: 300,
      input_tokens_details: { cached_tokens: 250 },
      output_tokens_details: { reasoning_tokens: 120 },
    };
    expect(openAiResponsesMeters(usage)).toEqual({ input_token: 750, cached_input_token: 250, text_output_token: 300 });
  });
  it("clamps and tolerates missing details", () => {
    expect(openAiResponsesMeters({ input_tokens: 50, output_tokens: 1, input_tokens_details: { cached_tokens: 90 } })).toEqual({
      cached_input_token: 50,
      text_output_token: 1,
    });
    expect(openAiResponsesMeters({ input_tokens: 50, output_tokens: 1 })).toEqual({ input_token: 50, text_output_token: 1 });
  });
});

describe("geminiMeters", () => {
  it("sums thoughts into output and subtracts cached from prompt", () => {
    expect(
      geminiMeters({ promptTokenCount: 2000, cachedContentTokenCount: 500, candidatesTokenCount: 300, thoughtsTokenCount: 700 }),
    ).toEqual({ input_token: 1500, cached_input_token: 500, text_output_token: 1000 });
  });
  it("omits zero and missing meters, clamps cached to prompt", () => {
    expect(geminiMeters({ promptTokenCount: 10, candidatesTokenCount: 4 })).toEqual({ input_token: 10, text_output_token: 4 });
    expect(geminiMeters({ promptTokenCount: 10, cachedContentTokenCount: 99 })).toEqual({ cached_input_token: 10 });
    expect(geminiMeters({})).toEqual({});
  });
});

describe("apifyMeters", () => {
  it("is usd when reported, empty when null", () => {
    expect(apifyMeters(0.0123)).toEqual({ usd: 0.0123 });
    expect(apifyMeters(null)).toEqual({});
    expect(apifyMeters(0)).toEqual({});
  });
});
