import { describe, it, expect } from "vitest";
import {
  normalizeOmniUsage,
  normalizeSeedanceUsage,
  normalizeKlingBilling,
  readVideoUsage,
  isTokenUsage,
} from "../provider-usage";

// The `usage` blocks Google returned for real probe generations (2026-11-19, Omni 1.2, 3s 360p).
const OMNI_REFERENCE_PROBE = {
  total_tokens: 8423,
  total_input_tokens: 1104,
  input_tokens_by_modality: [{ modality: "image", tokens: 1089 }, { modality: "text", tokens: 15 }],
  total_cached_tokens: 0,
  total_output_tokens: 5793,
  output_tokens_by_modality: [{ modality: "video", tokens: 5793 }],
  total_tool_use_tokens: 0,
  total_thought_tokens: 1526,
  initial_input_tokens: 1104,
};
const OMNI_EDIT_PROBE = {
  total_tokens: 11925,
  total_input_tokens: 5798,
  input_tokens_by_modality: [{ modality: "text", tokens: 5 }, { modality: "video", tokens: 5793 }],
  total_output_tokens: 5793,
  output_tokens_by_modality: [{ modality: "video", tokens: 5793 }],
  total_thought_tokens: 334,
};

describe("normalizeOmniUsage", () => {
  it("splits Google's usage into input, video output, text output and thinking", () => {
    expect(normalizeOmniUsage(OMNI_REFERENCE_PROBE)).toEqual({
      kind: "omni",
      inputTokens: 1104,
      videoOutputTokens: 5793,
      textOutputTokens: 0,
      thoughtTokens: 1526,
    });
  });

  it("counts output that is not video as text output", () => {
    const usage = normalizeOmniUsage({
      total_input_tokens: 10,
      total_output_tokens: 6000,
      output_tokens_by_modality: [{ modality: "video", tokens: 5793 }],
      total_thought_tokens: 0,
    });
    expect(usage?.textOutputTokens).toBe(207);
  });

  it("returns null when there is no usage or no video output count", () => {
    expect(normalizeOmniUsage(undefined)).toBeNull();
    expect(normalizeOmniUsage({})).toBeNull();
    expect(normalizeOmniUsage({ total_input_tokens: 10 })).toBeNull();
  });
});

describe("normalizeSeedanceUsage", () => {
  it("reads completion_tokens, the tokens BytePlus bills", () => {
    expect(normalizeSeedanceUsage({ completion_tokens: 108900, total_tokens: 108900 })).toEqual({
      kind: "seedance",
      completionTokens: 108900,
    });
  });

  it("returns null without a usable count", () => {
    expect(normalizeSeedanceUsage(undefined)).toBeNull();
    expect(normalizeSeedanceUsage({ completion_tokens: -1 })).toBeNull();
  });
});

describe("readVideoUsage (webhook body)", () => {
  it("accepts a well-formed Omni or Seedance usage", () => {
    const omni = normalizeOmniUsage(OMNI_EDIT_PROBE);
    expect(readVideoUsage(JSON.parse(JSON.stringify(omni)))).toEqual(omni);
    expect(readVideoUsage({ kind: "seedance", completionTokens: 5 })).toEqual({ kind: "seedance", completionTokens: 5 });
  });

  it("rejects anything else", () => {
    expect(readVideoUsage(undefined)).toBeNull();
    expect(readVideoUsage({ kind: "omni", inputTokens: 1 })).toBeNull();
    expect(readVideoUsage({ kind: "omni", inputTokens: -1, videoOutputTokens: 1, textOutputTokens: 0, thoughtTokens: 0 })).toBeNull();
    expect(readVideoUsage({ kind: "seedance", completionTokens: "5" })).toBeNull();
    expect(readVideoUsage({ kind: "kling" })).toBeNull();
  });
});

describe("normalizeKlingBilling (D535)", () => {
  it("sums several unit entries and keeps the list verbatim", () => {
    const billing = [
      { charge_type: "unit", amount: 4.2 },
      { charge_type: "unit", amount: 2.2 },
    ];
    expect(normalizeKlingBilling(billing)).toEqual({ kind: "kling", units: 6.4, raw: billing });
  });

  it("returns null for a missing or empty list, so the caller falls back", () => {
    expect(normalizeKlingBilling(undefined)).toBeNull();
    expect(normalizeKlingBilling(null)).toBeNull();
    expect(normalizeKlingBilling([])).toBeNull();
  });

  it("ignores non-numeric, negative and non-unit entries", () => {
    expect(normalizeKlingBilling([{ charge_type: "unit", amount: "abc" }, { charge_type: "unit", amount: -3 }])).toBeNull();
    const billing = [{ charge_type: "unit", amount: 2 }, { charge_type: "unit", amount: -3 }, { charge_type: "other", amount: 9 }];
    expect(normalizeKlingBilling(billing)).toEqual({ kind: "kling", units: 2, raw: billing });
  });

  it("survives the webhook round trip with its raw list", () => {
    const usage = normalizeKlingBilling([{ charge_type: "unit", amount: 1.5 }]);
    expect(readVideoUsage(JSON.parse(JSON.stringify(usage)))).toEqual(usage);
  });
});

describe("isTokenUsage", () => {
  it("is true for the token usages (Omni, Seedance) and false for Kling's units", () => {
    expect(isTokenUsage({ kind: "omni", inputTokens: 1, videoOutputTokens: 2, textOutputTokens: 0, thoughtTokens: 0 })).toBe(true);
    expect(isTokenUsage({ kind: "seedance", completionTokens: 5 })).toBe(true);
    expect(isTokenUsage({ kind: "kling", units: 6.4 })).toBe(false);
    expect(isTokenUsage(null)).toBe(false);
  });
});
