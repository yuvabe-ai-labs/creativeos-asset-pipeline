import { describe, it, expect } from "vitest";
import { seededPrice, seededCatalog } from "../test-prices";
import { videoSecondsUsd, videoChargeUsd } from "../video-price";
import { imageEstimateUsd } from "../image-price";

// D534 — migration 0078 is frozen history: these are the prices it seeded, pinned.
describe("migration 0078's prices", () => {
  it("parses every row", () => {
    // 21 rows from 0078, plus the 8 from 0080 (service prices and Kling unit rows).
    expect(seededCatalog().prices).toHaveLength(21 + 8);
  });
  it("video: per second", () => {
    expect(videoSecondsUsd(seededPrice("kling:kling-3-0"), 1, true, "720p")).toBeCloseTo(0.126, 10);
    expect(videoSecondsUsd(seededPrice("veo:veo-3.1-fast"), 1, false, "720p")).toBeCloseTo(0.1, 10);
    expect(videoSecondsUsd(seededPrice("gemini:gemini-omni-1.2-flash"), 1, false, "720p")).toBeCloseTo(0.069504, 10);
    expect(videoSecondsUsd(seededPrice("seedance:seedance-2-5"), 1, false, "720p")).toBeCloseTo(0.231, 10);
  });
  it("Omni 1.1 bills at 1.2 rates from 3 Dec", () => {
    expect(videoSecondsUsd(seededPrice("gemini:gemini-omni-1.1-flash", new Date("2026-11-22")), 1, false, "720p")).toBeCloseTo(0.10136, 10);
    expect(videoSecondsUsd(seededPrice("gemini:gemini-omni-1.1-flash", new Date("2026-12-04")), 1, false, "720p")).toBeCloseTo(0.069504, 10);
  });
  it("video: provider usage", () => {
    const usage = { kind: "omni" as const, inputTokens: 4718, videoOutputTokens: 11586, textOutputTokens: 0, thoughtTokens: 113 };
    expect(videoChargeUsd(seededPrice("gemini:gemini-omni-1.1-flash"), { usage, durationSeconds: 6, audioEnabled: false, resolution: "360p" })!.usd)
      .toBeCloseTo((4718 * 1.5 + 11586 * 17.5 + 113 * 9) / 1e6, 10);
  });
  it("image: estimates", () => {
    expect(imageEstimateUsd(seededPrice("openai:gpt-image-2"), { modelId: "openai:gpt-image-2", quality: "medium", aspectRatio: "1:1", referenceCount: 0 }))
      .toBeCloseTo(0.053 + (190 * 5) / 1e6, 10);
    expect(imageEstimateUsd(seededPrice("gemini:gemini-nano-banana-2.1"), { modelId: "gemini:gemini-nano-banana-2.1", imageSize: "1K", referenceCount: 0 }))
      .toBeCloseTo(0.0336 + (180 * 1.5) / 1e6 + (1000 * 7.5) / 1e6, 10);
    expect(imageEstimateUsd(seededPrice("seedream:seedream-5-0-pro"), { modelId: "seedream:seedream-5-0-pro", imageSize: "2K", referenceCount: 3 }))
      .toBeCloseTo(0.096, 10);
  });
});
