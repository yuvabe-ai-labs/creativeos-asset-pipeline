import { describe, it, expect } from "vitest";
import {
  normalizeOmniUsage,
  normalizeSeedanceUsage,
  readVideoUsage,
  computeVideoCostFromUsage,
  omniEstimateExtrasUsd,
  estimateVideoCostUsd,
} from "../provider-usage";
import { OMNI_11_REROUTE_AT, computeVideoCost } from "../cost";

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

describe("computeVideoCostFromUsage", () => {
  it("Omni 1.2: input $1.50/M + video out $12/M + text and thinking $9/M", () => {
    const usage = normalizeOmniUsage(OMNI_REFERENCE_PROBE)!;
    const cost = computeVideoCostFromUsage("gemini:gemini-omni-1.2-flash", usage, "360p");
    expect(cost?.usd).toBeCloseTo((1104 * 1.5 + 5793 * 12 + 1526 * 9) / 1_000_000, 8);
  });

  it("Omni edit bills the source video as input", () => {
    const usage = normalizeOmniUsage(OMNI_EDIT_PROBE)!;
    const cost = computeVideoCostFromUsage("gemini:gemini-omni-1.2-flash", usage, "360p");
    expect(cost?.usd).toBeCloseTo((5798 * 1.5 + 5793 * 12 + 334 * 9) / 1_000_000, 8);
  });

  it("Omni 1.1 bills video at $17.50/M until it is rerouted to 1.2", () => {
    const usage = normalizeOmniUsage(OMNI_REFERENCE_PROBE)!;
    const before = new Date(OMNI_11_REROUTE_AT.getTime() - 1);
    expect(computeVideoCostFromUsage("gemini:gemini-omni-1.1-flash", usage, "360p", before)?.usd)
      .toBeCloseTo((1104 * 1.5 + 5793 * 17.5 + 1526 * 9) / 1_000_000, 8);
    expect(computeVideoCostFromUsage("gemini:gemini-omni-1.1-flash", usage, "360p", OMNI_11_REROUTE_AT)?.usd)
      .toBeCloseTo((1104 * 1.5 + 5793 * 12 + 1526 * 9) / 1_000_000, 8);
  });

  it("Seedance 2.5: billed tokens at $10.70/M up to 720p, $11.70/M at 1080p", () => {
    const usage = { kind: "seedance" as const, completionTokens: 100_000 };
    expect(computeVideoCostFromUsage("seedance:seedance-2-5", usage, "480p")?.usd).toBeCloseTo(1.07, 8);
    expect(computeVideoCostFromUsage("seedance:seedance-2-5", usage, "720p")?.usd).toBeCloseTo(1.07, 8);
    expect(computeVideoCostFromUsage("seedance:seedance-2-5", usage, "1080p")?.usd).toBeCloseTo(1.17, 8);
  });

  it("returns null when the usage does not belong to the model", () => {
    const omni = normalizeOmniUsage(OMNI_REFERENCE_PROBE)!;
    expect(computeVideoCostFromUsage("seedance:seedance-2-5", omni, "720p")).toBeNull();
    expect(computeVideoCostFromUsage("kling:kling-3-0-omni", omni, "720p")).toBeNull();
    expect(computeVideoCostFromUsage("gemini:gemini-omni-1.2-flash", { kind: "seedance", completionTokens: 1 }, "720p")).toBeNull();
  });
});

describe("estimateVideoCostUsd", () => {
  it("is the per-second price plus Omni's extras", () => {
    const base = computeVideoCost("gemini:gemini-omni-1.2-flash", 8, false, "720p")!.usd;
    const extras = omniEstimateExtrasUsd("gemini:gemini-omni-1.2-flash", { images: 1, resolution: "720p" });
    expect(estimateVideoCostUsd("gemini:gemini-omni-1.2-flash", 8, false, "720p", { images: 1 })).toBeCloseTo(base + extras, 10);
  });

  it("is the per-second price alone for any other model", () => {
    expect(estimateVideoCostUsd("veo:veo-3.1-fast", 8, false, "720p", { images: 2 }))
      .toBeCloseTo(computeVideoCost("veo:veo-3.1-fast", 8, false, "720p")!.usd, 10);
  });

  it("is null when the model has no price at these params", () => {
    expect(estimateVideoCostUsd("kling:kling-2-6", 10, true, "720p", { images: 0 })).toBeNull();
  });
});

describe("omniEstimateExtrasUsd", () => {
  it("is zero for a model that is not Omni", () => {
    expect(omniEstimateExtrasUsd("kling:kling-3-0-omni", { images: 3, resolution: "720p" })).toBe(0);
  });

  it("adds a thinking allowance and each image as input", () => {
    expect(omniEstimateExtrasUsd("gemini:gemini-omni-1.2-flash", { images: 0, resolution: "720p" }))
      .toBeCloseTo((1500 * 9) / 1_000_000, 8);
    expect(omniEstimateExtrasUsd("gemini:gemini-omni-1.2-flash", { images: 2, resolution: "720p" }))
      .toBeCloseTo((2 * 1100 * 1.5 + 1500 * 9) / 1_000_000, 8);
  });

  it("adds an edit's source video as input, at the video's token rate per second", () => {
    expect(omniEstimateExtrasUsd("gemini:gemini-omni-1.2-flash", { images: 0, resolution: "360p", editInputSeconds: 3 }))
      .toBeCloseTo((3 * 1931 * 1.5 + 1500 * 9) / 1_000_000, 8);
  });
});
