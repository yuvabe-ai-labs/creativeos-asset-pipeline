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

  it("2.6: native audio at 720p is genuinely unpriced (not a fallback case) — returns null, never silently substitutes the off rate", () => {
    expect(computeVideoCost("kling:kling-2-6", 10, true, "720p")).toBeNull();
  });

  it("2.5-turbo: 720p/1080p, no audio tier", () => {
    expect(computeVideoCost("kling:kling-2-5-turbo", 10, false, "720p")?.usd).toBeCloseTo(0.42);
    expect(computeVideoCost("kling:kling-2-5-turbo", 10, false, "1080p")?.usd).toBeCloseTo(0.7);
  });

  it("3.0: off/native across 720p/1080p/4k — audio delta is +50%, not a flat $0.028/s step", () => {
    expect(computeVideoCost("kling:kling-3-0", 10, false, "720p")?.usd).toBeCloseTo(0.84);
    expect(computeVideoCost("kling:kling-3-0", 10, true, "720p")?.usd).toBeCloseTo(1.26);
    expect(computeVideoCost("kling:kling-3-0", 10, false, "1080p")?.usd).toBeCloseTo(1.12);
    expect(computeVideoCost("kling:kling-3-0", 10, true, "1080p")?.usd).toBeCloseTo(1.68);
    expect(computeVideoCost("kling:kling-3-0", 10, false, "4k")?.usd).toBeCloseTo(4.2);
    expect(computeVideoCost("kling:kling-3-0", 10, true, "4k")?.usd).toBeCloseTo(4.2);
  });

  it("o1: audio never changes price (real table splits by video-input, unreachable here, not audio), no 4k tier", () => {
    expect(computeVideoCost("kling:kling-o1", 10, false, "720p")?.usd).toBeCloseTo(0.84);
    expect(computeVideoCost("kling:kling-o1", 10, true, "720p")?.usd).toBeCloseTo(0.84);
    expect(computeVideoCost("kling:kling-o1", 10, false, "1080p")?.usd).toBeCloseTo(1.12);
    expect(computeVideoCost("kling:kling-o1", 10, true, "1080p")?.usd).toBeCloseTo(1.12);
    expect(computeVideoCost("kling:kling-o1", 10, false, "4k")).toBeNull();
  });

  it("defaults resolution to 720p when omitted", () => {
    const withDefault = computeVideoCost("kling:kling-2-5-turbo", 10, false);
    const explicit720p = computeVideoCost("kling:kling-2-5-turbo", 10, false, "720p");
    expect(withDefault).toEqual(explicit720p);
  });
});

describe("computeVideoCost — Veo (resolution-keyed, audio flag irrelevant)", () => {
  it("veo:veo-3.1-lite: $0.05/s at 720p, $0.08/s at 1080p", () => {
    expect(computeVideoCost("veo:veo-3.1-lite", 8, false, "720p")?.usd).toBeCloseTo(8 * 0.05);
    expect(computeVideoCost("veo:veo-3.1-lite", 8, false, "1080p")?.usd).toBeCloseTo(8 * 0.08);
  });

  it("veo:veo-3.1-fast: $0.10/s at 720p, $0.12/s at 1080p, audio flag irrelevant — Google publishes one flat with-audio rate, no cheaper no-audio tier", () => {
    expect(computeVideoCost("veo:veo-3.1-fast", 8, false, "720p")?.usd).toBeCloseTo(8 * 0.1);
    expect(computeVideoCost("veo:veo-3.1-fast", 8, false, "1080p")?.usd).toBeCloseTo(8 * 0.12);
    expect(computeVideoCost("veo:veo-3.1-fast", 8, true, "1080p")?.usd).toBeCloseTo(8 * 0.12);
  });

  it("veo:veo-3.1 (Quality): $0.40/s flat — same rate at 720p and 1080p", () => {
    expect(computeVideoCost("veo:veo-3.1", 10, false, "720p")?.usd).toBeCloseTo(10 * 0.4);
    expect(computeVideoCost("veo:veo-3.1", 10, false, "1080p")?.usd).toBeCloseTo(10 * 0.4);
  });

  it("defaults resolution to 720p when omitted", () => {
    const withDefault = computeVideoCost("veo:veo-3.1-fast", 8, false);
    const explicit720p = computeVideoCost("veo:veo-3.1-fast", 8, false, "720p");
    expect(withDefault).toEqual(explicit720p);
  });

  it("unknown resolution for a Veo model returns null, no silent fallback", () => {
    expect(computeVideoCost("veo:veo-3.1-fast", 8, false, "4k")).toBeNull();
  });
});

describe("computeVideoCost — Sora", () => {
  it("openai:sora-2 stays flat per-second, unaffected by resolution", () => {
    expect(computeVideoCost("openai:sora-2", 8, false, "1080p")?.usd).toBeCloseTo(8 * 0.1);
  });

  it("unknown model returns null", () => {
    expect(computeVideoCost("kling:kling-v1-5", 5, false)).toBeNull();
  });
});
