// Typical runs: the one definition of "a run of this model" that the models list, the model page's
// "Try a run" and the Credits page all show. A run's cost is worked out by the same estimators a
// real run reserves with, so the number an admin sees is the number an agency is charged. Client-safe.
import { paramDefaults } from "@/lib/ai-models/model-lists";
import { imageDims, imageEstimateUsd } from "@/lib/ai-models/image-price";
import { videoDims, videoEstimateUsd } from "@/lib/ai-models/video-price";
import {
  dubUsd,
  lipSyncUsd,
  promptFlatCredits,
  promptFlatUsd,
  transcribeEstimateUsd,
  voiceChangeEstimateUsd,
} from "@/lib/ai-models/service-price";
import { currentPrice, lineFor, priceMeters } from "@/lib/ai-models/pricing";
import { aspectRatioToOpenAISize } from "@/lib/image-gen/cost";
import { asResolutionString, isVideoAudioEnabled } from "@/lib/video-gen/cost";
import { creditsFromUsd } from "@/lib/credits/units";
import type { AiCatalog, AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { priceGrid, valueLabel, type PriceGrid } from "./price-grid";

/**
 * One run. `row` and `col` are the price grid's settings (image: size and, for OpenAI, quality;
 * video: resolution and audio). Null means the model's default for that setting.
 */
export type RunSpec =
  | { kind: "image"; row: string | null; col: string | null; references: number }
  | { kind: "video"; row: string | null; col: boolean | null; seconds: number; images: number }
  | { kind: "text"; inputTokens: number; outputTokens: number; attachments: number }
  | { kind: "dub" | "voice" | "lipsync" | "transcribe"; seconds: number };

/** What "Try a run" or a typical-runs entry changes from the typical run. */
export type RunChoice = Partial<{
  row: string | null;
  col: string | boolean | null;
  seconds: number;
  references: number;
  images: number;
  inputTokens: number;
  outputTokens: number;
  attachments: number;
}>;

type RunModel = Pick<AiModel, "id" | "kind" | "params" | "providerLabel">;

const isOpenAi = (m: RunModel) => m.id.startsWith("openai:");

function selectOptions(model: RunModel, name: string): string[] {
  const c = model.params.find((p) => p.name === name)?.constraints;
  return c?.type === "select" ? c.options : [];
}

/** The run at the model's default settings (the prototype's defaultSpec). Null for kinds with no run price. */
export function typicalRun(model: RunModel): RunSpec | null {
  const d = paramDefaults(model.params);
  switch (model.kind) {
    case "image": {
      const dims = imageDims(model.id, {
        quality: d.quality as string | undefined,
        aspectRatio: d.aspect_ratio as string | undefined,
        imageSize: d.image_size as string | undefined,
      });
      return { kind: "image", row: String(dims.size), col: isOpenAi(model) ? String(dims.quality) : null, references: 1 };
    }
    case "video": {
      const dims = videoDims(asResolutionString(d.resolution), isVideoAudioEnabled(d.audio));
      const seconds = Number(d.duration);
      return {
        kind: "video",
        row: String(dims.resolution),
        col: dims.audio === true,
        seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 8,
        images: 0,
      };
    }
    case "text":
      return { kind: "text", inputTokens: 2000, outputTokens: 500, attachments: 0 };
    case "dub":
    case "voice":
    case "lipsync":
      return { kind: model.kind, seconds: 30 };
    case "transcribe":
      return { kind: "transcribe", seconds: 60 };
    default:
      return null;
  }
}

const count = (n: unknown, fallback: number, min = 0) =>
  typeof n === "number" && Number.isInteger(n) && n >= min ? n : fallback;
const positive = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : fallback);

function gridChoice<T>(value: unknown, fallback: T, axis: PriceGrid["rowAxis"], values: PriceGrid["rowValues"]): T | null {
  if (!axis) return null;
  return values.some((v) => v.value === value) ? (value as T) : fallback;
}

/** The typical run with a choice applied, each setting kept only if the price grid has it (the prototype's calcSpec). */
export function runSpec(model: RunModel, price: AiModelPrice, choice: RunChoice = {}): RunSpec | null {
  const base = typicalRun(model);
  if (!base) return null;
  switch (base.kind) {
    case "image": {
      const g = priceGrid(model, price);
      return {
        kind: "image",
        row: gridChoice(choice.row ?? base.row, base.row, g.rowAxis, g.rowValues),
        col: gridChoice(choice.col ?? base.col, base.col, g.colAxis, g.colValues),
        references: count(choice.references, base.references),
      };
    }
    case "video": {
      const g = priceGrid(model, price);
      return {
        kind: "video",
        row: gridChoice(choice.row ?? base.row, base.row, g.rowAxis, g.rowValues),
        col: gridChoice(choice.col ?? base.col, base.col, g.colAxis, g.colValues),
        seconds: positive(choice.seconds, base.seconds),
        images: count(choice.images, base.images),
      };
    }
    case "text":
      return {
        kind: "text",
        inputTokens: count(choice.inputTokens, base.inputTokens),
        outputTokens: count(choice.outputTokens, base.outputTokens),
        attachments: count(choice.attachments, base.attachments),
      };
    default:
      return { kind: base.kind, seconds: positive(choice.seconds, base.seconds) };
  }
}

/** An aspect ratio this OpenAI model offers that runs at `size`; imageDims maps it back to the same size. */
function aspectRatioFor(model: RunModel, size: string): string | null {
  return [...selectOptions(model, "aspect_ratio"), "1:1", "16:9", "9:16"].find((r) => aspectRatioToOpenAISize(r) === size) ?? null;
}

/** A text row with a request line is charged that flat price per run (prompt runs, D536). */
const hasFlatPrice = (price: AiModelPrice) => lineFor(price, "request", {}) !== null;

/** What this run costs us, in USD, by the estimator a real run reserves with. Null when the run has no price. */
export function runCostUsd(model: RunModel, price: AiModelPrice, spec: RunSpec): number | null {
  if (spec.kind !== model.kind) return null;
  const d = paramDefaults(model.params);
  switch (spec.kind) {
    case "image": {
      const base = { modelId: model.id, referenceCount: spec.references };
      if (isOpenAi(model)) {
        const aspectRatio = spec.row === null ? (d.aspect_ratio as string | undefined) : aspectRatioFor(model, spec.row);
        if (aspectRatio === null) return null;
        return imageEstimateUsd(price, { ...base, aspectRatio, quality: spec.col ?? (d.quality as string | undefined) });
      }
      return imageEstimateUsd(price, { ...base, imageSize: spec.row ?? (d.image_size as string | undefined) });
    }
    case "video":
      return videoEstimateUsd(price, {
        durationSeconds: spec.seconds,
        audioEnabled: spec.col ?? isVideoAudioEnabled(d.audio),
        resolution: spec.row ?? asResolutionString(d.resolution),
        images: spec.images,
      });
    case "text": {
      if (hasFlatPrice(price)) return promptFlatUsd(price, spec.attachments);
      const r = priceMeters(price, { input_token: spec.inputTokens, text_output_token: spec.outputTokens });
      return r.unpriced.length ? null : r.usd;
    }
    case "dub":
      return dubUsd(price, spec.seconds);
    case "voice":
      return voiceChangeEstimateUsd(price, spec.seconds, 1);
    case "lipsync":
      return lipSyncUsd(price, spec.seconds);
    case "transcribe":
      return transcribeEstimateUsd(price, spec.seconds);
  }
}

/** The credits this run is charged: creditsFromUsd with the settings row, or a prompt run's flat credits. */
export function runCredits(
  model: RunModel,
  price: AiModelPrice,
  spec: RunSpec,
  settings: Pick<CreditSettings, "marginPercent" | "roundStep">,
): number | null {
  const usd = runCostUsd(model, price, spec);
  if (usd === null) return null;
  return flatCredits(model, price, spec) ?? creditsFromUsd(usd, settings);
}

/** A prompt run's flat credits (D536: no margin, no step); null for every other run. */
export function flatCredits(model: RunModel, price: AiModelPrice, spec: RunSpec): number | null {
  if (spec.kind !== "text" || model.kind !== "text" || !hasFlatPrice(price)) return null;
  return promptFlatCredits(price, spec.attachments);
}

const tokens = (n: number) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : String(n));
const length = (seconds: number) => (seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** The run in words: "8 s, 720p, with audio", "1 image, Square, Medium, 1 reference", "2K tokens in, 500 out". */
export function specLabel(model: RunModel, price: AiModelPrice, spec: RunSpec): string {
  switch (spec.kind) {
    case "video": {
      const g = priceGrid(model, price);
      return [
        `${spec.seconds} s`,
        g.rowAxis && spec.row !== null ? valueLabel("resolution", spec.row) : null,
        g.colAxis && spec.col !== null ? valueLabel("audio", spec.col).toLowerCase() : null,
      ].filter(Boolean).join(", ");
    }
    case "image": {
      const g = priceGrid(model, price);
      return [
        "1 image",
        g.rowAxis && spec.row !== null ? valueLabel("size", spec.row) : null,
        g.colAxis && spec.col !== null ? valueLabel("quality", spec.col) : null,
        spec.references === 0 ? "no reference" : plural(spec.references, "reference", "references"),
      ].filter(Boolean).join(", ");
    }
    case "text":
      if (hasFlatPrice(price)) {
        return `1 request, ${spec.attachments === 0 ? "no attached image" : plural(spec.attachments, "attached image", "attached images")}`;
      }
      return `${tokens(spec.inputTokens)} tokens in, ${tokens(spec.outputTokens)} out`;
    case "lipsync":
      return `${length(spec.seconds)} of video`;
    default:
      return `${length(spec.seconds)} of audio`;
  }
}

/** The Credits page's typical runs: a few real models at settings agencies use, named in plain words. */
export const TYPICAL_RUNS: ReadonlyArray<{ modelId: string; label: string; choice: RunChoice }> = [
  { modelId: "gemini:gemini-omni-1.1-flash", label: "8 s video at 720p", choice: { seconds: 8, row: "720p" } },
  { modelId: "gemini:gemini-omni-1.2-flash", label: "8 s video at 720p", choice: { seconds: 8, row: "720p" } },
  { modelId: "kling:kling-3-0-omni", label: "5 s video at 720p with audio", choice: { seconds: 5, row: "720p", col: true } },
  { modelId: "seedance:seedance-2-5", label: "5 s video at 720p", choice: { seconds: 5, row: "720p" } },
  { modelId: "gemini:gemini-3-pro-image", label: "1K image with one reference", choice: { row: "1K", references: 1 } },
  ...(["low", "medium", "high"] as const).map((q) => ({
    modelId: "openai:gpt-image-2",
    label: `${valueLabel("quality", q)} quality square image, no reference`,
    choice: { row: "1024x1024", col: q, references: 0 },
  })),
  { modelId: "openai:gpt-5.4-mini", label: "Prompt run with no attached image", choice: { attachments: 0 } },
  { modelId: "sarvam:dub", label: "30 s of dubbed audio", choice: { seconds: 30 } },
];

export type TypicalRunRow = { model: AiModel; price: AiModelPrice; label: string; spec: RunSpec; usd: number };

/** TYPICAL_RUNS priced at the row each model has live at `at`; a run with no model or price then is left out. */
export function typicalRunRows(catalog: Pick<AiCatalog, "models" | "prices">, at: Date): TypicalRunRow[] {
  return TYPICAL_RUNS.flatMap((run) => {
    const model = catalog.models.find((m) => m.id === run.modelId);
    const price = model ? currentPrice(catalog, model.id, at) : null;
    const spec = model && price ? runSpec(model, price, run.choice) : null;
    const usd = model && price && spec ? runCostUsd(model, price, spec) : null;
    return model && price && spec && usd !== null ? [{ model, price, label: run.label, spec, usd }] : [];
  });
}
