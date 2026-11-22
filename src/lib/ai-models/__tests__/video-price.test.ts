import { describe, it, expect } from "vitest";
import { videoSecondsUsd, videoEstimateUsd, videoChargeUsd, videoUsageMeters } from "../video-price";
import type { AiModelPrice } from "../types";

const OMNI_12: AiModelPrice = {
  id: "o12", modelId: "gemini:gemini-omni-1.2-flash", effectiveFrom: "2026-01-01T00:00:00Z",
  sourceUrl: null, note: null,
  lines: [
    { meter: "video_second", unit_usd: (1931 * 12) / 1e6, when: { resolution: "360p" } },
    { meter: "video_second", unit_usd: (5792 * 12) / 1e6, when: { resolution: "720p" } },
    { meter: "input_token", unit_usd: 1.5 / 1e6 },
    { meter: "video_output_token", unit_usd: 12 / 1e6 },
    { meter: "text_output_token", unit_usd: 9 / 1e6 },
    { meter: "thought_token", unit_usd: 9 / 1e6 },
  ],
  estimate: {
    input_tokens_per_image: 1100, thought_tokens: 1500,
    edit_input_tokens_per_second_360p: 1931, edit_input_tokens_per_second_720p: 5792,
  },
};
const VEO: AiModelPrice = {
  id: "v", modelId: "veo:veo-3.1-fast", effectiveFrom: "2026-01-01T00:00:00Z", sourceUrl: null, note: null,
  estimate: {}, lines: [{ meter: "video_second", unit_usd: 0.1, when: { resolution: "720p" } }],
};

describe("videoSecondsUsd", () => {
  it("prices seconds at the resolution's line, 720p when unset", () => {
    expect(videoSecondsUsd(VEO, 8, false, undefined)).toBeCloseTo(0.8, 10);
  });
  it("is null when the resolution has no line, even for zero seconds", () => {
    expect(videoSecondsUsd(VEO, 8, false, "4k")).toBeNull();
    expect(videoSecondsUsd(VEO, 0, false, "4k")).toBeNull();
  });
});

describe("videoEstimateUsd", () => {
  it("is the per-second price for a model with no allowances", () => {
    expect(videoEstimateUsd(VEO, { durationSeconds: 8, audioEnabled: false, resolution: "720p", images: 3 })).toBeCloseTo(0.8, 10);
  });
  it("adds Omni's images, the edit's source clip and the thinking allowance", () => {
    const usd = videoEstimateUsd(OMNI_12, { durationSeconds: 6, audioEnabled: false, resolution: "360p", images: 2, editInputSeconds: 6 });
    const base = 6 * (1931 * 12) / 1e6;
    const extras = ((2 * 1100 + 6 * 1931) * 1.5 + 1500 * 9) / 1e6;
    expect(usd).toBeCloseTo(base + extras, 10);
  });
  it("uses the 720p edit rate for a resolution with no allowance of its own", () => {
    const usd = videoEstimateUsd(OMNI_12, { durationSeconds: 1, audioEnabled: false, resolution: "720p", images: 0, editInputSeconds: 1 });
    expect(usd).toBeCloseTo((5792 * 12) / 1e6 + (5792 * 1.5 + 1500 * 9) / 1e6, 10);
  });
});

describe("videoChargeUsd", () => {
  const usage = { kind: "omni" as const, inputTokens: 4718, videoOutputTokens: 11586, textOutputTokens: 0, thoughtTokens: 113 };

  it("prices the provider's usage when every meter has a line", () => {
    const c = videoChargeUsd(OMNI_12, { usage, durationSeconds: 6, audioEnabled: false, resolution: "360p" });
    expect(c?.source).toBe("provider_usage");
    expect(c?.usd).toBeCloseTo((4718 * 1.5 + 11586 * 12 + 113 * 9) / 1e6, 10);
    expect(c?.meters).toEqual(videoUsageMeters(usage));
  });
  it("falls back to the duration when there is no usage or a meter has no line", () => {
    expect(videoChargeUsd(VEO, { usage: null, durationSeconds: 8, audioEnabled: false, resolution: "720p" }))
      .toEqual({ usd: expect.closeTo(0.8, 10), source: "request", meters: { video_second: 8 } });
    expect(videoChargeUsd(VEO, { usage, durationSeconds: 8, audioEnabled: false, resolution: "720p" })?.source).toBe("request");
  });
  it("is null when neither the usage nor the duration can be priced", () => {
    expect(videoChargeUsd(VEO, { usage: null, durationSeconds: 8, audioEnabled: false, resolution: "4k" })).toBeNull();
  });
  it("maps Seedance's billed tokens to video output tokens", () => {
    expect(videoUsageMeters({ kind: "seedance", completionTokens: 108900 })).toEqual({ video_output_token: 108900 });
  });
});
