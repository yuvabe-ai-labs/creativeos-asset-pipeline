// D546 — the checks every admin write to a model or a price runs. Pure and client-safe.
import { paramDefaults } from "./model-lists";
import { checkAiModelRow } from "./schema";
import { imageEstimateUsd } from "./image-price";
import { videoEstimateUsd } from "./video-price";
import { asResolutionString, isVideoAudioEnabled } from "@/lib/video-gen/cost";
import type { ParamSpec } from "@/lib/image-gen/types";
import type { AiModel, AiModelPrice, PriceLine } from "./types";

export const EDITABLE_MODEL_FIELDS = [
  "label", "picker_label", "provider_label", "description", "status", "replaced_by", "sort_order",
] as const;
export type ModelPatch = Partial<Record<(typeof EDITABLE_MODEL_FIELDS)[number], unknown>>;
export type EditContext = { models: AiModel[]; prices: AiModelPrice[]; runnableKeys: ReadonlySet<string> };

const BREAK_ERROR = "These changes would break the model's settings.";
const REPLACEMENT_ERROR = "Pick a live model of the same kind as the replacement.";
const NO_ADAPTER_ERROR = "This model can't go live: this build has no code to run it.";

/**
 * Price dimensions the estimators set that need not be a param of the model: `size` (imageDims:
 * the OpenAI size derived from the aspect ratio, or the Gemini image size), `resolution` and
 * `audio` (videoDims, which always set both: a model with no resolution param is priced at 720p).
 * A key that IS a param is still checked against the param, except `audio`: the dimension is the
 * boolean the estimator derives from the param, not its raw value.
 */
export const ALLOWED_PRICE_DIMS: readonly string[] = ["size", "resolution", "audio"];

export function checkModelPatch(
  rawRow: Record<string, unknown>,
  patch: Record<string, unknown>,
  ctx: EditContext,
): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string; log?: unknown } {
  const editable: readonly string[] = EDITABLE_MODEL_FIELDS;
  const outside = Object.keys(patch).filter((k) => !editable.includes(k));
  if (outside.length > 0) return { ok: false, error: BREAK_ERROR, log: { notEditable: outside } };

  const merged: Record<string, unknown> = { ...rawRow, ...patch };
  const fields: Record<string, unknown> = { ...patch };
  if (merged.status !== "retired") {
    merged.replaced_by = null;
    // Only written when there is a stale replacement to clear, or the patch named one.
    if (rawRow.replaced_by !== null && rawRow.replaced_by !== undefined) fields.replaced_by = null;
    else if ("replaced_by" in patch) fields.replaced_by = null;
  } else if (merged.replaced_by !== null && merged.replaced_by !== undefined) {
    const target = ctx.models.find((m) => m.id === merged.replaced_by);
    if (!target || target.kind !== merged.kind || target.status !== "live" || target.id === rawRow.id) {
      return { ok: false, error: REPLACEMENT_ERROR };
    }
  }
  if (merged.status === "live" && (merged.kind === "image" || merged.kind === "video")) {
    if (typeof merged.adapter_key !== "string" || !ctx.runnableKeys.has(merged.adapter_key)) {
      return { ok: false, error: NO_ADAPTER_ERROR };
    }
  }
  const checked = checkAiModelRow(merged);
  if (!checked.model) return { ok: false, error: BREAK_ERROR, log: checked.problems };
  return { ok: true, fields };
}

function valueProblem(p: ParamSpec, value: unknown): string | null {
  const c = p.constraints;
  switch (c.type) {
    case "select":
      return typeof value === "string" && c.options.includes(value) ? null : `${p.name}: ${String(value)} is not an option`;
    case "slider":
    case "number":
      return typeof value === "number" && (c.min === undefined || value >= c.min) && (c.max === undefined || value <= c.max)
        ? null
        : `${p.name}: ${String(value)} is out of range`;
    case "toggle":
      return typeof value === "boolean" ? null : `${p.name}: ${String(value)} is not a boolean`;
    default:
      return `${p.name}: can't be used in a price condition`;
  }
}

/** One plain string per condition that names an unknown setting or a value the setting can't take. */
export function priceConditionProblems(params: ParamSpec[], lines: PriceLine[]): string[] {
  const problems: string[] = [];
  for (const line of lines) {
    for (const [key, value] of Object.entries(line.when ?? {})) {
      const param = key === "audio" ? undefined : params.find((p) => p.name === key);
      if (!param) {
        if (!ALLOWED_PRICE_DIMS.includes(key)) problems.push(`${line.meter}: ${key} is not a setting of this model`);
        continue;
      }
      const problem = valueProblem(param, value);
      if (problem) problems.push(`${line.meter}: ${problem}`);
    }
  }
  return problems;
}

/**
 * For the params editor (a later task) to call: names and component/constraint types stay,
 * and every price condition must still match. Phase 1 refuses `params` in a patch outright.
 */
export function checkParamsChange(
  oldParams: ParamSpec[],
  newParams: ParamSpec[],
  prices: AiModelPrice[],
): { ok: true } | { ok: false; error: string; log?: unknown } {
  const names = (ps: ParamSpec[]) => ps.map((p) => p.name).sort().join("\u0000");
  if (names(oldParams) !== names(newParams)) return { ok: false, error: BREAK_ERROR, log: "param names changed" };
  for (const o of oldParams) {
    const n = newParams.find((p) => p.name === o.name)!;
    if (n.component !== o.component || n.constraints.type !== o.constraints.type) {
      return { ok: false, error: BREAK_ERROR, log: `${o.name}: type changed` };
    }
  }
  const problems = prices.flatMap((p) => priceConditionProblems(newParams, p.lines));
  if (problems.length > 0) return { ok: false, error: BREAK_ERROR, log: problems };
  return { ok: true };
}

export function checkNewPrice(
  model: AiModel,
  input: { effectiveFrom: Date; lines: PriceLine[]; estimate: Record<string, number> },
  existing: AiModelPrice[],
  now: Date,
): { ok: true } | { ok: false; error: string } {
  const at = input.effectiveFrom.getTime();
  if (Number.isNaN(at) || at < now.getTime() - 60_000) return { ok: false, error: "A price can't start in the past." };
  if (existing.some((p) => p.modelId === model.id && new Date(p.effectiveFrom).getTime() === at)) {
    return { ok: false, error: "This model already has a price starting then." };
  }
  if (priceConditionProblems(model.params, input.lines).length > 0) {
    return { ok: false, error: "A price condition names a setting this model doesn't have." };
  }
  if (input.lines.length === 0 || input.lines.some((l) => !(l.unit_usd >= 0))) {
    return { ok: false, error: BREAK_ERROR };
  }
  return { ok: true };
}

/** What one run at the model's default settings is reserved at. Null for kinds with no estimate. */
export function runPreviewUsd(model: AiModel, price: AiModelPrice): number | null {
  const d = paramDefaults(model.params);
  if (model.kind === "image") {
    return imageEstimateUsd(price, {
      modelId: model.id,
      quality: d.quality as string | undefined,
      aspectRatio: d.aspect_ratio as string | undefined,
      imageSize: d.image_size as string | undefined,
      referenceCount: 0,
    });
  }
  if (model.kind === "video") {
    return videoEstimateUsd(price, {
      durationSeconds: Number(d.duration),
      audioEnabled: isVideoAudioEnabled(d.audio),
      resolution: asResolutionString(d.resolution),
      images: 0,
    });
  }
  return null;
}
