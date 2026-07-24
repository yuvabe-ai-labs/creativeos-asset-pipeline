import { describe, it, expect } from "vitest";
import { computeVideoCost } from "../cost";

describe("computeVideoCost — Kling (resolution-keyed)", () => {
  it("3.0-turbo: 720p and 1080p, audio flag irrelevant (always native)", () => {
    const result1 = computeVideoCost("kling:kling-3-0-turbo", 10, false, "720p");
    expect(result1?.usd).toBeCloseTo(1.12);
    expect(result1?.inr).toBeCloseTo(1.12 * 95.77);

    const result2 = computeVideoCost("kling:kling-3-0-turbo", 10, true, "1080p");
    expect(result2?.usd).toBeCloseTo(1.4);
    expect(result2?.inr).toBeCloseTo(1.4 * 95.77);
  });

  it("2.6: off at 720p/1080p, native only defined at 1080p", () => {
    expect(computeVideoCost("kling:kling-2-6", 10, false, "720p")?.usd).toBeCloseTo(0.42);
    expect(computeVideoCost("kling:kling-2-6", 10, false, "1080p")?.usd).toBeCloseTo(0.7);
    expect(computeVideoCost("kling:kling-2-6", 10, true, "1080p")?.usd).toBeCloseTo(1.4);
  });

  it("2.5-turbo: 720p/1080p, no audio tier", () => {
    expect(computeVideoCost("kling:kling-2-5-turbo", 10, false, "720p")?.usd).toBeCloseTo(0.42);
    expect(computeVideoCost("kling:kling-2-5-turbo", 10, false, "1080p")?.usd).toBeCloseTo(0.7);
  });

  it("3.0: off/native across 720p/1080p/4k", () => {
    expect(computeVideoCost("kling:kling-3-0", 10, false, "720p")?.usd).toBeCloseTo(0.84);
    expect(computeVideoCost("kling:kling-3-0", 10, true, "720p")?.usd).toBeCloseTo(1.12);
    expect(computeVideoCost("kling:kling-3-0", 10, false, "4k")?.usd).toBeCloseTo(4.2);
    expect(computeVideoCost("kling:kling-3-0", 10, true, "4k")?.usd).toBeCloseTo(4.2);
  });

  it("o1: off/original across 720p/1080p, no 4k tier", () => {
    expect(computeVideoCost("kling:kling-o1", 10, false, "720p")?.usd).toBeCloseTo(0.84);
    expect(computeVideoCost("kling:kling-o1", 10, true, "1080p")?.usd).toBeCloseTo(1.4);
    expect(computeVideoCost("kling:kling-o1", 10, false, "4k")).toBeNull();
  });

  it("defaults resolution to 720p when omitted", () => {
    const withDefault = computeVideoCost("kling:kling-2-5-turbo", 10, false);
    const explicit720p = computeVideoCost("kling:kling-2-5-turbo", 10, false, "720p");
    expect(withDefault).toEqual(explicit720p);
  });
});

describe("computeVideoCost — Veo/Sora unaffected by the resolution param", () => {
  it("veo:veo-3.1-fast ignores resolution and the audio flag — Google publishes one flat with-audio rate, no cheaper no-audio tier", () => {
    const withAudioFlagTrue = computeVideoCost("veo:veo-3.1-fast", 8, true, "1080p");
    const withAudioFlagFalse = computeVideoCost("veo:veo-3.1-fast", 8, false, "1080p");
    expect(withAudioFlagTrue?.usd).toBeCloseTo(8 * 0.1);
    expect(withAudioFlagFalse?.usd).toBeCloseTo(8 * 0.1);
  });

  it("veo:veo-3.1 (Quality) uses the corrected $0.40/s rate", () => {
    const cost = computeVideoCost("veo:veo-3.1", 10, false);
    expect(cost?.usd).toBeCloseTo(10 * 0.4);
  });

  it("unknown model returns null", () => {
    expect(computeVideoCost("kling:kling-v1-5", 5, false)).toBeNull();
  });
});
