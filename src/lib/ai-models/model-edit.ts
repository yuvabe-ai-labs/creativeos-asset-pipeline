// D546 — the checks every admin write to a model or a price runs. Pure and client-safe.
import { paramDefaults } from "./model-lists";
import { aspectRatioToOpenAISize } from "@/lib/image-gen/cost";
import { checkAiModelPriceRow, checkAiModelRow } from "./schema";
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

/** Whether a value is one this param can hold. Null when it is. */
function valueProblem(p: ParamSpec, value: unknown): string | null {
  const c = p.constraints;
  switch (c.type) {
    case "select":
      return typeof value === "string" && c.options.includes(value) ? null : `${p.name}: ${String(value)} is not an option`;
    case "slider":
    case "number":
      return typeof value === "number" && Number.isFinite(value) && (c.min === undefined || value >= c.min) && (c.max === undefined || value <= c.max)
        ? null
        : `${p.name}: ${String(value)} is out of range`;
    case "toggle":
      return typeof value === "boolean" ? null : `${p.name}: ${String(value)} is not a boolean`;
    case "textarea":
      return typeof value === "string" && (c.maxLength === undefined || value.length <= c.maxLength)
        ? null
        : `${p.name}: ${String(value)} is not valid text`;
  }
}

const RESOLUTIONS = ["360p", "480p", "720p", "1080p", "4k"];
const OPENAI_QUALITIES = ["low", "medium", "high"];

function optionsOf(params: readonly ParamSpec[], name: string): string[] | null {
  const c = params.find((p) => p.name === name)?.constraints;
  return c?.type === "select" ? c.options : null;
}

/**
 * The price dimensions a model can ever have, and the values each can take. Read from imageDims
 * (image-price.ts) and videoDims (video-price.ts): image models have `size` (and `quality` for
 * openai: models); video models have `resolution` and `audio`. Any other key never matches a run.
 */
function priceDims(model: Pick<AiModel, "id" | "kind" | "params">): Record<string, readonly (string | boolean)[]> {
  if (model.kind === "image") {
    if (model.id.startsWith("openai:")) {
      const ratios = optionsOf(model.params, "aspect_ratio") ?? ["1:1"];
      return {
        // "auto" is estimated and charged as high, so a line for it would never match.
        quality: (optionsOf(model.params, "quality") ?? OPENAI_QUALITIES).filter((q) => q !== "auto"),
        size: [...new Set(ratios.map(aspectRatioToOpenAISize))],
      };
    }
    return { size: optionsOf(model.params, "image_size") ?? ["1K"] };
  }
  if (model.kind === "video") {
    return { resolution: optionsOf(model.params, "resolution") ?? RESOLUTIONS, audio: [true, false] };
  }
  return {};
}

/** One plain string per condition that names a setting the run never prices on, or a value it never has. */
export function priceConditionProblems(model: Pick<AiModel, "id" | "kind" | "params">, lines: PriceLine[]): string[] {
  const dims = priceDims(model);
  const problems: string[] = [];
  for (const line of lines) {
    for (const [key, value] of Object.entries(line.when ?? {})) {
      const allowed = dims[key];
      if (!allowed) problems.push(`${line.meter}: ${key} is not a price setting of this model`);
      else if (!allowed.includes(value as string | boolean)) problems.push(`${line.meter}: ${key} can never be ${String(value)}`);
    }
  }
  return problems;
}

/**
 * For the params editor (a later task) to call. `prices` are the model's price rows that are
 * current or future, not history. Names and component/constraint types stay; defaults and rule
 * locks stay valid; every price condition still matches a value the run can have.
 */
export function checkParamsChange(
  model: Pick<AiModel, "id" | "kind" | "params" | "rules">,
  newParams: ParamSpec[],
  prices: AiModelPrice[],
): { ok: true } | { ok: false; error: string; log?: unknown } {
  const fail = (log: unknown) => ({ ok: false as const, error: BREAK_ERROR, log });
  const oldParams = model.params;
  const names = (ps: ParamSpec[]) => ps.map((p) => p.name).sort().join("|");
  if (names(oldParams) !== names(newParams)) return fail("param names changed");
  for (const o of oldParams) {
    const n = newParams.find((p) => p.name === o.name)!;
    if (n.component !== o.component || n.constraints.type !== o.constraints.type) return fail(`${o.name}: type changed`);
  }
  for (const p of newParams) {
    if (p.defaultValue === null || p.defaultValue === undefined) continue;
    const problem = valueProblem(p, p.defaultValue);
    if (problem) return fail(`default: ${problem}`);
  }
  for (const rule of model.rules) {
    for (const lock of rule.effect.lockParams ?? []) {
      const p = newParams.find((x) => x.name === lock.name);
      const problem = p ? valueProblem(p, lock.value) : `${lock.name}: no such param`;
      if (problem) return fail(`rule ${rule.id}: ${problem}`);
    }
  }
  const next = { id: model.id, kind: model.kind, params: newParams };
  const problems = prices.flatMap((p) => priceConditionProblems(next, p.lines));
  if (problems.length > 0) return fail(problems);
  return { ok: true };
}

export function checkNewPrice(
  model: AiModel,
  input: { effectiveFrom: Date; lines: PriceLine[]; estimate: Record<string, number> },
  existing: Pick<AiModelPrice, "modelId" | "effectiveFrom">[],
  now: Date,
): { ok: true } | { ok: false; error: string } {
  const at = input.effectiveFrom.getTime();
  if (Number.isNaN(at) || at < now.getTime() - 60_000) return { ok: false, error: "A price can't start in the past." };
  if (existing.some((p) => p.modelId === model.id && new Date(p.effectiveFrom).getTime() === at)) {
    return { ok: false, error: "This model already has a price starting then." };
  }
  if (priceConditionProblems(model, input.lines).length > 0) {
    return { ok: false, error: "A price condition names a setting this model doesn't have." };
  }
  const candidate = checkAiModelPriceRow({
    id: "new",
    model_id: model.id,
    effective_from: input.effectiveFrom.toISOString(),
    lines: input.lines,
    estimate: input.estimate,
    source_url: null,
    note: null,
  });
  if (!candidate.price) return { ok: false, error: BREAK_ERROR };
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
    const durationSeconds = Number(d.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
    return videoEstimateUsd(price, {
      durationSeconds,
      audioEnabled: isVideoAudioEnabled(d.audio),
      resolution: asResolutionString(d.resolution),
      images: 0,
    });
  }
  return null;
}
