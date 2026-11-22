import { describe, it, expect } from "vitest";
import { seededCatalog } from "../test-prices";
import { currentPrice } from "../pricing";
import { videoEstimateUsd } from "../video-price";
import { imageEstimateUsd } from "../image-price";
import { usdToFinalCredits } from "@/lib/credits/units";
import { imageGenClientModels } from "@/lib/image-gen/client-models";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { isVideoAudioEnabled } from "@/lib/video-gen/cost";
import { videoEditEstimateCredits, VIDEO_EDIT_MODEL_IDS, VIDEO_EDIT_RESOLUTIONS } from "@/lib/video-edit/record";
import type { ParamSpec } from "@/lib/image-gen/types";

// D534 — every price a model can quote in the browser, pinned over the whole grid of its own
// settings, on the rows migration 0078 seeded. A price change shows up here as a snapshot diff.
const AT = new Date("2026-11-22T00:00:00Z");
const REFERENCES = [0, 1, 3];

const priceOf = (modelId: string) => currentPrice(seededCatalog(), modelId, AT);
const param = (params: ParamSpec[], ...names: string[]) => params.find((p) => names.includes(p.name));
const credits = (usd: number | null) => (usd === null ? null : usdToFinalCredits(usd));

function options(spec: ParamSpec | undefined, withUndefined: boolean): Array<string | undefined> {
  const out: Array<string | undefined> = [];
  if (spec?.constraints.type === "select") out.push(...spec.constraints.options);
  if (withUndefined || out.length === 0) out.push(undefined);
  return out;
}

function durations(spec: ParamSpec | undefined): number[] {
  if (!spec) return [0];
  const c = spec.constraints;
  const all = c.type === "slider" ? [c.min, c.max, Number(spec.defaultValue)]
    : c.type === "select" ? c.options.map(Number)
    : [Number(spec.defaultValue)];
  return [...new Set(all.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
}

function audioStates(spec: ParamSpec | undefined): boolean[] {
  if (!spec) return [false];
  const values = spec.constraints.type === "select" ? spec.constraints.options : [];
  return [...new Set(values.map((v) => isVideoAudioEnabled(v)))].sort();
}

describe("migration 0078's prices over every setting", () => {
  it("image models", () => {
    const grid: Record<string, number | null> = {};
    for (const model of imageGenClientModels) {
      const price = priceOf(model.id);
      for (const quality of options(param(model.params, "quality"), true))
        for (const aspectRatio of options(param(model.params, "aspect_ratio"), false))
          for (const imageSize of options(param(model.params, "image_size"), false))
            for (const referenceCount of REFERENCES) {
              const key = [model.id, `q=${quality}`, `ar=${aspectRatio}`, `size=${imageSize}`, `refs=${referenceCount}`].join("|");
              grid[key] = price ? credits(imageEstimateUsd(price, { modelId: model.id, quality, aspectRatio, imageSize, referenceCount })) : null;
            }
    }
    expect(Object.keys(grid).length).toBeGreaterThan(100);
    expect(grid).toMatchSnapshot();
  });

  it("video models", () => {
    const grid: Record<string, number | null> = {};
    for (const model of Object.values(videoGenClientModelMap)) {
      const price = priceOf(model.id);
      for (const resolution of options(param(model.params, "resolution"), true))
        for (const durationSeconds of durations(param(model.params, "duration", "seconds")))
          for (const audioEnabled of audioStates(param(model.params, "audio")))
            for (const images of REFERENCES) {
              const key = [model.id, `res=${resolution}`, `s=${durationSeconds}`, `audio=${audioEnabled}`, `images=${images}`].join("|");
              grid[key] = price ? credits(videoEstimateUsd(price, { durationSeconds, audioEnabled, resolution, images })) : null;
            }
    }
    expect(Object.keys(grid).length).toBeGreaterThan(100);
    expect(grid).toMatchSnapshot();
  });

  it("Omni edit video", () => {
    const grid: Record<string, number | null> = {};
    for (const modelId of VIDEO_EDIT_MODEL_IDS) {
      const model = videoGenClientModelMap[modelId];
      for (const resolution of VIDEO_EDIT_RESOLUTIONS)
        for (const durationSeconds of durations(param(model.params, "duration")))
          for (const references of REFERENCES) {
            grid[`${modelId}|res=${resolution}|s=${durationSeconds}|refs=${references}`] =
              videoEditEstimateCredits(priceOf(modelId), durationSeconds, resolution, references);
          }
    }
    expect(Object.keys(grid).length).toBeGreaterThan(20);
    expect(grid).toMatchSnapshot();
  });
});
