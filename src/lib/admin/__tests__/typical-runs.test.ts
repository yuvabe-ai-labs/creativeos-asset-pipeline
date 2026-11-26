import { describe, expect, it } from "vitest";
import { seededModelCatalog, seededSettingsRow } from "@/lib/ai-models/test-catalog";
import { imageEstimateUsd } from "@/lib/ai-models/image-price";
import { videoEstimateUsd } from "@/lib/ai-models/video-price";
import { runPreviewUsd } from "@/lib/ai-models/model-edit";
import { paramDefaults } from "@/lib/ai-models/model-lists";
import {
  dubUsd,
  lipSyncUsd,
  promptFlatCredits,
  transcribeEstimateUsd,
  voiceChangeEstimateUsd,
} from "@/lib/ai-models/service-price";
import { aspectRatioToOpenAISize } from "@/lib/image-gen/cost";
import { creditsFromUsd, rawCreditsFromUsd } from "@/lib/credits/units";
import type { AiModel, AiModelPrice } from "@/lib/ai-models/types";
import type { ParamSpec } from "@/lib/image-gen/types";
import { priceGrid } from "../price-grid";
import { TYPICAL_RUNS, runCostUsd, runCredits, runSpec, specLabel, typicalRun, typicalRunRows } from "../typical-runs";

const catalog = seededModelCatalog();
const settings = seededSettingsRow();
const model = (id: string): AiModel => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`no seeded model ${id}`);
  return m;
};
const lastPrice = (id: string): AiModelPrice => {
  const row = catalog.prices.filter((p) => p.modelId === id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
  if (!row) throw new Error(`no seeded price for ${id}`);
  return row;
};
const rowsOf = (kind: string) =>
  catalog.prices.flatMap((price) => {
    const m = catalog.models.find((x) => x.id === price.modelId);
    return m && m.kind === kind ? [[`${m.id} from ${price.effectiveFrom}`, m, price] as const] : [];
  });
const options = (params: readonly ParamSpec[], name: string): string[] | null => {
  const c = params.find((p) => p.name === name)?.constraints;
  return c?.type === "select" ? c.options : null;
};

describe("runCostUsd equals the estimator a real run uses", () => {
  it.each(rowsOf("image"))("image %s, at every setting and reference count", (_n, m, price) => {
    for (const references of [0, 1, 3]) {
      if (m.id.startsWith("openai:")) {
        for (const aspectRatio of options(m.params, "aspect_ratio") ?? ["1:1"]) {
          for (const quality of (options(m.params, "quality") ?? ["low", "medium", "high"]).filter((q) => q !== "auto")) {
            const expected = imageEstimateUsd(price, { modelId: m.id, quality, aspectRatio, referenceCount: references });
            const spec = { kind: "image" as const, row: aspectRatioToOpenAISize(aspectRatio), col: quality, references };
            expect(runCostUsd(m, price, spec)).toBe(expected);
          }
        }
      } else {
        for (const imageSize of options(m.params, "image_size") ?? ["1K"]) {
          const expected = imageEstimateUsd(price, { modelId: m.id, imageSize, referenceCount: references });
          expect(runCostUsd(m, price, { kind: "image", row: imageSize, col: null, references })).toBe(expected);
        }
      }
    }
  });

  it.each(rowsOf("video"))("video %s, at every setting, length and image count", (_n, m, price) => {
    const grid = priceGrid(m, price);
    const resolutions = grid.rowValues.map((v) => v.value as string | null);
    for (const resolution of resolutions) {
      for (const audio of grid.colAxis ? [true, false] : [null]) {
        for (const seconds of [3, 8]) {
          for (const images of [0, 2]) {
            const expected = videoEstimateUsd(price, {
              durationSeconds: seconds, audioEnabled: audio ?? false, resolution: resolution ?? undefined, images,
            });
            expect(runCostUsd(m, price, { kind: "video", row: resolution, col: audio, seconds, images })).toBe(expected);
          }
        }
      }
    }
  });

  it.each([...rowsOf("image"), ...rowsOf("video")])("the typical run of %s is the run at the model's defaults", (_n, m, price) => {
    const spec = typicalRun(m);
    if (m.kind === "video") {
      expect(runCostUsd(m, price, spec!)).toBe(runPreviewUsd(m, price));
    } else {
      const d = paramDefaults(m.params);
      expect(spec).toMatchObject({ kind: "image", references: 1 });
      expect(runCostUsd(m, price, spec!)).toBe(
        imageEstimateUsd(price, {
          modelId: m.id,
          quality: d.quality as string | undefined,
          aspectRatio: d.aspect_ratio as string | undefined,
          imageSize: d.image_size as string | undefined,
          referenceCount: 1,
        }),
      );
    }
    expect(runCostUsd(m, price, spec!)).not.toBeNull();
  });

  it("services use their own estimators", () => {
    const dub = model("sarvam:dub");
    expect(typicalRun(dub)).toEqual({ kind: "dub", seconds: 30 });
    expect(runCostUsd(dub, lastPrice(dub.id), { kind: "dub", seconds: 30.4 })).toBe(dubUsd(lastPrice(dub.id), 30.4));
    const voice = model("elevenlabs:eleven_multilingual_sts_v2");
    expect(runCostUsd(voice, lastPrice(voice.id), typicalRun(voice)!)).toBe(voiceChangeEstimateUsd(lastPrice(voice.id), 30, 1));
    const lip = model("fal:lipsync-2-pro");
    expect(runCostUsd(lip, lastPrice(lip.id), typicalRun(lip)!)).toBe(lipSyncUsd(lastPrice(lip.id), 30));
    const scribe = model("elevenlabs:scribe_v2");
    expect(typicalRun(scribe)).toEqual({ kind: "transcribe", seconds: 60 });
    expect(runCostUsd(scribe, lastPrice(scribe.id), typicalRun(scribe)!)).toBe(transcribeEstimateUsd(lastPrice(scribe.id), 60));
    expect(typicalRun(model("apify:actor"))).toBeNull();
  });

  it("text: tokens at the row's prices, or the flat price when the row has one", () => {
    const gpt5 = model("openai:gpt-5");
    expect(typicalRun(gpt5)).toEqual({ kind: "text", inputTokens: 2000, outputTokens: 500, attachments: 0 });
    expect(runCostUsd(gpt5, lastPrice(gpt5.id), typicalRun(gpt5)!)).toBeCloseTo(2000 * 0.00000125 + 500 * 0.00001, 12);
    const mini = model("openai:gpt-5.4-mini");
    const p = lastPrice(mini.id);
    expect(runCostUsd(mini, p, typicalRun(mini)!)).toBe(0.005);
    expect(runCostUsd(mini, p, { kind: "text", inputTokens: 2000, outputTokens: 500, attachments: 2 })).toBe(0.01);
    // A flat price is converted without margin or step, like a real prompt run.
    expect(runCredits(mini, p, typicalRun(mini)!, { marginPercent: 50, roundStep: 10 })).toBe(promptFlatCredits(p, 0));
    expect(runCredits(mini, p, typicalRun(mini)!, settings)).toBe(5);
  });

  it("a spec of another kind, or a setting with no price, costs nothing", () => {
    const omni = model("gemini:gemini-omni-1.2-flash");
    expect(runCostUsd(omni, lastPrice(omni.id), { kind: "dub", seconds: 30 })).toBeNull();
    expect(runCostUsd(omni, lastPrice(omni.id), { kind: "video", row: "480p", col: null, seconds: 8, images: 0 })).toBeNull();
  });
});

describe("credits", () => {
  it("runCredits goes through creditsFromUsd with the settings row", () => {
    const omni = model("gemini:gemini-omni-1.1-flash");
    const p = lastPrice(omni.id);
    const spec = typicalRun(omni)!;
    const usd = runCostUsd(omni, p, spec)!;
    for (const s of [settings, { marginPercent: 20, roundStep: 1 as const }, { marginPercent: 0, roundStep: 10 as const }]) {
      expect(runCredits(omni, p, spec, s)).toBe(creditsFromUsd(usd, s));
    }
  });
  it("unrounded credits are the step's input", () => {
    expect(rawCreditsFromUsd(0.0123, { marginPercent: 0 })).toBe(12.3);
    expect(creditsFromUsd(0.0123, { marginPercent: 0, roundStep: 5 })).toBe(15);
    expect(rawCreditsFromUsd(5 * 0.084, { marginPercent: 0 })).toBe(420);
  });
});

describe("runSpec (the Try a run choice)", () => {
  it("keeps a valid choice and falls back to the typical setting otherwise", () => {
    const kling = model("kling:kling-3-0");
    const p = lastPrice(kling.id);
    expect(runSpec(kling, p, {})).toEqual({ kind: "video", row: "720p", col: true, seconds: 5, images: 0 });
    expect(runSpec(kling, p, { row: "4k", col: false, seconds: 10 })).toEqual({ kind: "video", row: "4k", col: false, seconds: 10, images: 0 });
    expect(runSpec(kling, p, { row: "8k", col: "maybe" as never })).toEqual({ kind: "video", row: "720p", col: true, seconds: 5, images: 0 });
    const img = model("openai:gpt-image-2");
    expect(runSpec(img, lastPrice(img.id), { col: "high", references: 0 })).toEqual({ kind: "image", row: "1024x1024", col: "high", references: 0 });
  });
  it("a video with no audio column has no audio choice", () => {
    const s = model("seedance:seedance-2-5");
    expect(runSpec(s, lastPrice(s.id), { col: true })).toEqual({ kind: "video", row: "720p", col: null, seconds: 5, images: 0 });
  });
});

describe("specLabel", () => {
  it("reads like the prototype", () => {
    const kling = model("kling:kling-3-0");
    const p = lastPrice(kling.id);
    expect(specLabel(kling, p, typicalRun(kling)!)).toBe("5 s, 720p, with audio");
    const img = model("openai:gpt-image-2");
    expect(specLabel(img, lastPrice(img.id), typicalRun(img)!)).toBe("1 image, Square, Medium, 1 reference");
    expect(specLabel(img, lastPrice(img.id), { kind: "image", row: "1024x1024", col: "low", references: 0 })).toBe("1 image, Square, Low, no reference");
    expect(specLabel(model("openai:gpt-5"), lastPrice("openai:gpt-5"), typicalRun(model("openai:gpt-5"))!)).toBe("2K tokens in, 500 out");
    expect(specLabel(model("sarvam:dub"), lastPrice("sarvam:dub"), { kind: "dub", seconds: 30 })).toBe("30 s of audio");
    expect(specLabel(model("elevenlabs:scribe_v2"), lastPrice("elevenlabs:scribe_v2"), { kind: "transcribe", seconds: 60 })).toBe("1 min of audio");
  });
});

describe("TYPICAL_RUNS (the Credits page list)", () => {
  it("names only seeded models, with a setting each one prices", () => {
    for (const run of TYPICAL_RUNS) expect(catalog.models.some((m) => m.id === run.modelId)).toBe(true);
  });
  it("prices every run from the catalog at a moment", () => {
    const at = new Date("2026-11-24T00:00:00Z");
    const rows = typicalRunRows(catalog, at);
    expect(rows).toHaveLength(TYPICAL_RUNS.length);
    for (const r of rows) {
      expect(r.usd).not.toBeNull();
      expect(r.usd).toBe(runCostUsd(r.model, r.price, r.spec));
    }
    const kling = rows.find((r) => r.model.id === "kling:kling-3-0-omni")!;
    expect(kling.spec).toEqual({ kind: "video", row: "720p", col: true, seconds: 5, images: 0 });
    expect(kling.usd).toBeCloseTo(5 * 0.112, 12);
    const highImage = rows.find((r) => r.model.id === "openai:gpt-image-2" && r.spec.kind === "image" && r.spec.col === "high")!;
    expect(highImage.usd).toBe(imageEstimateUsd(highImage.price, { modelId: "openai:gpt-image-2", quality: "high", aspectRatio: "1:1", referenceCount: 0 }));
  });
  it("uses the price row live at that moment", () => {
    const before = typicalRunRows(catalog, new Date("2026-12-01T00:00:00Z")).find((r) => r.model.id === "gemini:gemini-omni-1.1-flash")!;
    const after = typicalRunRows(catalog, new Date("2026-12-04T00:00:00Z")).find((r) => r.model.id === "gemini:gemini-omni-1.1-flash")!;
    expect(after.usd!).toBeLessThan(before.usd!);
  });
  it("skips a run whose model has no price then", () => {
    const rows = typicalRunRows({ ...catalog, prices: catalog.prices.filter((p) => p.modelId !== "sarvam:dub") }, new Date("2026-11-24T00:00:00Z"));
    expect(rows.some((r) => r.model.id === "sarvam:dub")).toBe(false);
  });
});
