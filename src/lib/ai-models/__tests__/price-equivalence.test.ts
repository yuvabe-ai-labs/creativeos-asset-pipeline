import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { seededPrice } from "../test-prices";
import { videoSecondsUsd, videoEstimateUsd, videoChargeUsd } from "../video-price";
import { imageEstimateUsd, imageChargeUsd } from "../image-price";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVideoCostFromUsage, estimateVideoCostUsd, normalizeOmniUsage } from "@/lib/video-gen/provider-usage";
import { computeImageCost, seedreamImageCostUsd } from "@/lib/image-gen/cost";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import { currentPrice } from "../pricing";
import { seededCatalog } from "../test-prices";
import { imageGenClientModels } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import type { ParamSpec } from "@/lib/image-gen/types";

// D534 — the seeded rows must reproduce today's prices for every model and every value its
// params can take, before any caller reads a row instead of a table.
const MILLION = 1_000_000;
const BEFORE = new Date("2026-11-22T00:00:00Z");
const AFTER = new Date("2026-12-04T00:00:00Z");
const options = (params: ParamSpec[], name: string): (string | undefined)[] => {
  const p = params.find((x) => x.name === name);
  return p && p.constraints.type === "select" ? p.constraints.options : [undefined];
};
// Both the dollars and the credits a customer sees must match; null (unpriced) must match null.
const same = (a: number | null, b: number | null) => {
  if (a === null || b === null) expect(a).toBe(b);
  else {
    expect(a).toBeCloseTo(b, 10);
    expect(usdToFinalCredits(a)).toBe(usdToFinalCredits(b));
  }
};

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(BEFORE); });
afterAll(() => vi.useRealTimers());

describe("video", () => {
  for (const m of Object.values(videoGenClientModelMap)) {
    it(m.id, () => {
      for (const resolution of [...options(m.params, "resolution"), "4k"]) {
        for (const audio of [false, true]) {
          for (const d of [3, 6, 10]) {
            for (const at of [BEFORE, AFTER]) {
              same(videoSecondsUsd(seededPrice(m.id, at), d, audio, resolution), computeVideoCost(m.id, d, audio, resolution, at)?.usd ?? null);
            }
            for (const images of [0, 2]) {
              for (const editInputSeconds of [0, d]) {
                same(
                  videoEstimateUsd(seededPrice(m.id, BEFORE), { durationSeconds: d, audioEnabled: audio, resolution, images, editInputSeconds }),
                  estimateVideoCostUsd(m.id, d, audio, resolution, { images, editInputSeconds }),
                );
              }
            }
          }
        }
      }
    });
  }

  it("prices Omni's reported usage the same, before and after 3 Dec", () => {
    const usages = [
      normalizeOmniUsage({ total_input_tokens: 1104, output_tokens_by_modality: [{ modality: "video", tokens: 5793 }], total_output_tokens: 5793, total_thought_tokens: 1526 })!,
      normalizeOmniUsage({ total_input_tokens: 5798, output_tokens_by_modality: [{ modality: "video", tokens: 5793 }], total_output_tokens: 5793, total_thought_tokens: 334 })!,
      { kind: "omni" as const, inputTokens: 4718, videoOutputTokens: 11586, textOutputTokens: 0, thoughtTokens: 113 },
    ];
    for (const id of ["gemini:gemini-omni-1.1-flash", "gemini:gemini-omni-1.2-flash"]) {
      for (const at of [BEFORE, AFTER]) {
        for (const usage of usages) {
          const c = videoChargeUsd(seededPrice(id, at), { usage, durationSeconds: 3, audioEnabled: false, resolution: "360p" });
          expect(c?.source).toBe("provider_usage");
          same(c!.usd, computeVideoCostFromUsage(id, usage, "360p", at)!.usd);
        }
      }
    }
  });

  it("prices Seedance's billed tokens the same at every resolution", () => {
    for (const resolution of ["480p", "720p", "1080p"]) {
      const usage = { kind: "seedance" as const, completionTokens: 108_900 };
      same(
        videoChargeUsd(seededPrice("seedance:seedance-2-5"), { usage, durationSeconds: 5, audioEnabled: false, resolution })!.usd,
        computeVideoCostFromUsage("seedance:seedance-2-5", usage, resolution)!.usd,
      );
    }
  });

  it("gives the edit panel the same credits (audio on, the take as input)", () => {
    for (const id of ["gemini:gemini-omni-1.1-flash", "gemini:gemini-omni-1.2-flash"]) {
      for (const resolution of ["720p", "1080p", "4k"]) {
        for (const refs of [0, 3]) {
          const ours = videoEstimateUsd(seededPrice(id), { durationSeconds: 6, audioEnabled: true, resolution, images: refs, editInputSeconds: 6 });
          const today = estimateVideoCostUsd(id, 6, true, resolution, { images: refs, editInputSeconds: 6 });
          expect(ours === null ? null : usdToFinalCredits(ours)).toBe(today === null ? null : usdToFinalCredits(today));
        }
      }
    }
  });
});

describe("image", () => {
  const TOKENS = [
    { text_input_tokens: 12, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 2143, text_output_tokens: 234, thought_tokens: 777 },
    { text_input_tokens: 260, image_input_tokens: 1536, image_output_tokens: 1372, total_tokens: 3168 },
    { text_input_tokens: 5305, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 6885 },
  ];

  for (const m of imageGenClientModels) {
    it(m.id, () => {
      const price = seededPrice(m.id);
      for (const quality of options(m.params, "quality")) {
        for (const aspectRatio of options(m.params, "aspect_ratio")) {
          for (const imageSize of options(m.params, "image_size")) {
            for (const referenceCount of [0, 1, 3]) {
              same(
                imageEstimateUsd(price, { modelId: m.id, quality, aspectRatio, imageSize, referenceCount }),
                estimateImageGenerationCostUsd({ modelId: m.id, quality, aspectRatio, imageSize, referenceUrls: Array(referenceCount).fill("") }),
              );
              if (m.provider === "seedream" && imageSize) {
                const billed = imageChargeUsd(price, { tokens: null, billedImages: { output_image: 1, input_image: Math.max(0, referenceCount - 1), size: imageSize } });
                same(billed!.unpriced.length ? null : billed!.usd, seedreamImageCostUsd(m.id, imageSize, referenceCount));
              }
            }
          }
        }
      }
      if (m.provider !== "seedream") {
        for (const tokens of TOKENS) same(imageChargeUsd(price, { tokens, billedImages: null })!.usd, computeImageCost(m.id, tokens)!.usd);
      }
    });
  }
});

describe("video: added coverage", () => {
  const KLING = Object.values(videoGenClientModelMap).filter((m) => m.provider === "kling");

  it("Kling: audio on and off at every resolution, unpriced combinations stay null", () => {
    expect(KLING.length).toBeGreaterThan(0);
    for (const m of KLING) {
      const price = seededPrice(m.id);
      for (const resolution of ["360p", "480p", "720p", "1080p", "4k", "8k"]) {
        for (const audio of [true, false]) {
          const today = computeVideoCost(m.id, 5, audio, resolution, BEFORE)?.usd ?? null;
          const ours = videoSecondsUsd(price, 5, audio, resolution);
          same(ours, today);
          if (today === null) expect(ours).toBeNull();
        }
      }
    }
  });

  it("every Omni row has token lines and edit allowances at all four resolutions", () => {
    for (const id of ["gemini:gemini-omni-1.1-flash", "gemini:gemini-omni-1.2-flash"]) {
      for (const at of [BEFORE, AFTER]) {
        const price = seededPrice(id, at);
        const meters = price.lines.map((l) => l.meter);
        expect(meters).toContain("input_token");
        expect(meters).toContain("thought_token");
        for (const r of ["360p", "720p", "1080p", "4k"]) {
          expect(price.estimate[`edit_input_tokens_per_second_${r}`]).toBeGreaterThan(0);
        }
        for (const r of ["360p", "720p", "1080p", "4k"]) {
          for (const refs of [0, 2]) {
            const ours = videoEstimateUsd(price, { durationSeconds: 6, audioEnabled: true, resolution: r, images: refs, editInputSeconds: 6 });
            vi.setSystemTime(at);
            const today = estimateVideoCostUsd(id, 6, true, r, { images: refs, editInputSeconds: 6 });
            vi.setSystemTime(BEFORE);
            same(ours, today);
          }
        }
      }
    }
  });

  it("Seedance: 480p and 720p at the standard rate, 1080p at the hd rate", () => {
    const price = seededPrice("seedance:seedance-2-5");
    const rate = (resolution: string) =>
      videoChargeUsd(price, { usage: { kind: "seedance", completionTokens: MILLION }, durationSeconds: 5, audioEnabled: false, resolution })!.usd;
    expect(rate("480p")).toBeCloseTo(rate("720p"), 10);
    for (const resolution of ["480p", "720p", "1080p"]) {
      same(rate(resolution), computeVideoCostFromUsage("seedance:seedance-2-5", { kind: "seedance", completionTokens: MILLION }, resolution)!.usd);
    }
  });

  it("a resolution the code does not price is null from the row, never 0", () => {
    for (const m of Object.values(videoGenClientModelMap)) {
      for (const resolution of ["8k", "999p"]) {
        const today = computeVideoCost(m.id, 5, false, resolution, BEFORE)?.usd ?? null;
        const ours = videoSecondsUsd(seededPrice(m.id), 5, false, resolution);
        same(ours, today);
        if (today === null) expect(ours).toBeNull();
      }
    }
  });

  it("Omni 1.1 prices at 1.1 rates at 07:59:59Z and at 1.2 rates from 08:00:00Z", () => {
    const usage = { kind: "omni" as const, inputTokens: 5798, videoOutputTokens: 5793, textOutputTokens: 0, thoughtTokens: 334 };
    const charge = (id: string, at: Date) => {
      const price = currentPrice(seededCatalog(), id, at)!;
      return videoChargeUsd(price, { usage, durationSeconds: 3, audioEnabled: false, resolution: "720p" })!.usd;
    };
    const before = new Date("2026-12-03T07:59:59Z");
    const after = new Date("2026-12-03T08:00:00Z");
    const m11 = "gemini:gemini-omni-1.1-flash";
    same(charge(m11, before), computeVideoCostFromUsage(m11, usage, "720p", before)!.usd);
    same(charge(m11, after), computeVideoCostFromUsage(m11, usage, "720p", after)!.usd);
    expect(charge(m11, before)).not.toBeCloseTo(charge(m11, after), 6);
    expect(charge(m11, after)).toBeCloseTo(charge("gemini:gemini-omni-1.2-flash", after), 10);
    expect(charge(m11, before)).toBeCloseTo(computeVideoCostFromUsage(m11, usage, "720p", before)!.usd, 10);
  });
});

describe("image: added coverage", () => {
  const find = (id: string) => imageGenClientModels.find((m) => m.id === id)!;
  const NO_TEXT_OUT = ["gemini:gemini-2.5-flash-image", ...imageGenClientModels.filter((m) => m.provider === "openai").map((m) => m.id)];

  it("models without text output carry no text-output or thought line", () => {
    for (const id of NO_TEXT_OUT) {
      const meters = seededPrice(id).lines.map((l) => l.meter);
      expect(meters).not.toContain("text_output_token");
      expect(meters).not.toContain("thought_token");
    }
  });

  it("OpenAI qualities: auto and undefined price as high; xhigh/max only on the 2.5 models", () => {
    for (const m of imageGenClientModels.filter((x) => x.provider === "openai")) {
      const price = seededPrice(m.id);
      for (const quality of [undefined, "auto", "low", "medium", "high", "xhigh", "max"]) {
        const args = { modelId: m.id, quality, aspectRatio: "1:1", referenceCount: 0 };
        const ours = imageEstimateUsd(price, args);
        same(ours, estimateImageGenerationCostUsd({ modelId: m.id, quality, aspectRatio: "1:1", imageSize: undefined, referenceUrls: [] }));
      }
      const high = imageEstimateUsd(price, { modelId: m.id, quality: "high", aspectRatio: "1:1", referenceCount: 0 });
      expect(imageEstimateUsd(price, { modelId: m.id, quality: "auto", aspectRatio: "1:1", referenceCount: 0 })).toBe(high);
      expect(imageEstimateUsd(price, { modelId: m.id, quality: undefined, aspectRatio: "1:1", referenceCount: 0 })).toBe(high);
      const is25 = m.id.startsWith("openai:gpt-image-2.5");
      for (const quality of ["xhigh", "max"]) {
        const ours = imageEstimateUsd(price, { modelId: m.id, quality, aspectRatio: "1:1", referenceCount: 0 });
        if (is25) expect(ours).toBeGreaterThan(0);
        else expect(ours).toBeNull();
      }
    }
  });

  it("Seedream: the first reference is free, Pro prices later ones, Lite none", () => {
    for (const id of ["seedream:seedream-5-0-lite", "seedream:seedream-5-0-pro"]) {
      const price = seededPrice(id);
      const size = options(find(id).params, "image_size")[0];
      const est = (n: number) => imageEstimateUsd(price, { modelId: id, imageSize: size, referenceCount: n })!;
      expect(est(1)).toBeCloseTo(est(0), 10);
      // Pro prices each reference after the first; Lite's references are free.
      if (id.endsWith("pro")) expect(est(3)).toBeGreaterThan(est(1));
      else expect(est(3)).toBeCloseTo(est(1), 10);
      for (const n of [0, 1, 3]) {
        same(est(n), estimateImageGenerationCostUsd({ modelId: id, quality: undefined, aspectRatio: undefined, imageSize: size, referenceUrls: Array(n).fill("") }));
      }
    }
  });

  it("a size or quality the code does not price is null from the row, never 0", () => {
    for (const m of imageGenClientModels) {
      const price = seededPrice(m.id);
      const args = m.provider === "openai" ? { quality: "bogus" } : { imageSize: "9K" };
      const ours = imageEstimateUsd(price, { modelId: m.id, ...args, referenceCount: 0 });
      const today = (() => {
        try {
          return estimateImageGenerationCostUsd({ modelId: m.id, quality: undefined, aspectRatio: undefined, imageSize: undefined, ...args, referenceUrls: [] });
        } catch {
          return null;
        }
      })();
      if (today === null) expect(ours).toBeNull();
      else same(ours, today);
    }
  });

  it("the 19-21 Nov Nano Banana usage prices the same through the row", () => {
    const tokens = { text_input_tokens: 260, image_input_tokens: 1536, image_output_tokens: 1372, total_tokens: 3168 };
    for (const id of ["gemini:gemini-3.1-flash-image", "gemini:gemini-nano-banana-2.1", "gemini:gemini-3-pro-image"]) {
      same(imageChargeUsd(seededPrice(id), { tokens, billedImages: null })!.usd, computeImageCost(id, tokens)!.usd);
    }
  });
});
