// D569 — the checks every admin write to a model or a price runs. Pure and client-safe.
import { paramDefaults } from "./model-lists";
import { aspectRatioToOpenAISize } from "@/lib/image-gen/cost";
import { checkAiModelPriceRow, checkAiModelRow } from "./schema";
import { IMAGE_ESTIMATE_KEYS, imageEstimateUsd } from "./image-price";
import { videoEstimateKeys, videoEstimateUsd } from "./video-price";
import { TRANSCRIBE_ESTIMATE_KEYS } from "./service-price";
import { asResolutionString, isVideoAudioEnabled } from "@/lib/video-gen/cost";
import { CATALOG_CHANGE_LEAD_MS } from "./pricing";
import type { ParamSpec } from "@/lib/image-gen/types";
import type { AiModel, AiModelPrice, PriceLine } from "./types";

export const EDITABLE_MODEL_FIELDS = [
  "label", "picker_label", "provider_label", "description", "status", "replaced_by", "sort_order",
] as const;
export type ModelPatch = Partial<Record<(typeof EDITABLE_MODEL_FIELDS)[number], unknown>>;
/**
 * `prices`: price rows that pass their check, from a fresh read (the action reads this model's own);
 * `now`: when a price counts as started (defaults to the call's time).
 */
export type EditContext = { models: AiModel[]; prices: AiModelPrice[]; runnableKeys: ReadonlySet<string>; now?: Date };

const BREAK_ERROR = "These changes would break the model's settings.";
const REPLACEMENT_ERROR = "Pick a live model of the same kind as the replacement.";
const NO_ADAPTER_ERROR = "This model can't go live: this build has no code to run it.";
const LAST_LIVE_ERROR = "This is the last live model of its kind. Make another one live first.";
const MIGRATION_ERROR = "This model's settings are broken and need a migration to fix.";
const NAME_ERROR = "A model needs a name.";
const NO_PRICE_ERROR = "This model needs a price before it can go live.";

const TEXT_FIELDS = ["label", "picker_label", "provider_label", "description"];
const NAME_FIELDS = ["label", "provider_label"];

export function checkModelPatch(
  rawRow: Record<string, unknown>,
  rawPatch: Record<string, unknown>,
  ctx: EditContext,
): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string; log?: unknown } {
  const editable: readonly string[] = EDITABLE_MODEL_FIELDS;
  const outside = Object.keys(rawPatch).filter((k) => !editable.includes(k));
  if (outside.length > 0) return { ok: false, error: BREAK_ERROR, log: { notEditable: outside } };

  const patch: Record<string, unknown> = { ...rawPatch };
  for (const k of TEXT_FIELDS) {
    if (typeof patch[k] === "string") patch[k] = (patch[k] as string).trim();
  }
  if (NAME_FIELDS.some((k) => patch[k] === "")) return { ok: false, error: NAME_ERROR };

  const merged: Record<string, unknown> = { ...rawRow, ...patch };
  const isMedia = merged.kind === "image" || merged.kind === "video";
  if (rawRow.status === "live" && merged.status !== "live" && isMedia) {
    const another = ctx.models.some((m) => m.kind === merged.kind && m.status === "live" && m.id !== rawRow.id);
    if (!another) return { ok: false, error: LAST_LIVE_ERROR };
  }

  const fields: Record<string, unknown> = { ...patch };
  // A replacement that has since left live stays until the admin touches status or replacement.
  const touchesReplacement = "status" in patch || "replaced_by" in patch;
  if (merged.status !== "retired") {
    merged.replaced_by = null;
    // Only written when there is a stale replacement to clear, or the patch named one.
    if (rawRow.replaced_by !== null && rawRow.replaced_by !== undefined) fields.replaced_by = null;
    else if ("replaced_by" in patch) fields.replaced_by = null;
  } else if (touchesReplacement && merged.replaced_by !== null && merged.replaced_by !== undefined) {
    const target = ctx.models.find((m) => m.id === merged.replaced_by);
    if (!target || target.kind !== merged.kind || target.status !== "live" || target.id === rawRow.id) {
      return { ok: false, error: REPLACEMENT_ERROR };
    }
  } else if (touchesReplacement && isMedia) {
    // A retired image or video model must name where its nodes go (D569, amended).
    return { ok: false, error: REPLACEMENT_ERROR };
  }
  if (merged.status === "live" && isMedia) {
    if (typeof merged.adapter_key !== "string" || !ctx.runnableKeys.has(merged.adapter_key)) {
      return { ok: false, error: NO_ADAPTER_ERROR };
    }
    // Going live needs a price that has started; a run of a live model with none is refused (D569, amended).
    const at = (ctx.now ?? new Date()).getTime();
    const started = ctx.prices.some((p) => p.modelId === rawRow.id && new Date(p.effectiveFrom).getTime() <= at);
    if (rawRow.status !== "live" && !started) return { ok: false, error: NO_PRICE_ERROR };
  }
  const checked = checkAiModelRow(merged);
  if (!checked.model) {
    // A row already broken in a field this form can't change is fixed by a migration, not here.
    const error = checkAiModelRow(rawRow).model ? BREAK_ERROR : MIGRATION_ERROR;
    return { ok: false, error, log: checked.problems };
  }
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
export function priceDims(model: Pick<AiModel, "id" | "kind" | "params">): Record<string, readonly (string | boolean)[]> {
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

/** The estimate allowances this model's estimator reads. Any other name is never read. */
export function estimateAllowanceKeys(model: Pick<AiModel, "id" | "kind" | "params">): string[] {
  if (model.kind === "image") return model.id.startsWith("seedream:") ? [] : [...IMAGE_ESTIMATE_KEYS];
  // The edit allowance falls back to 720p, so it is offered for every resolution and 720p.
  if (model.kind === "video") {
    const resolutions = optionsOf(model.params, "resolution") ?? RESOLUTIONS;
    return videoEstimateKeys([...new Set([...resolutions, "720p"])]);
  }
  if (model.kind === "transcribe") return [...TRANSCRIBE_ESTIMATE_KEYS];
  return [];
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

/**
 * `effectiveFrom` in the result is the start the row gets. A start up to now stays: a run records
 * the price row it used, so a row live at once is safe. A start in the next CATALOG_CHANGE_LEAD_MS is
 * moved out to it, so every server has the row before it starts and it can't be cancelled under a run.
 */
export function checkNewPrice(
  model: AiModel,
  input: { effectiveFrom: Date; lines: PriceLine[]; estimate: Record<string, number> },
  existing: Pick<AiModelPrice, "modelId" | "effectiveFrom">[],
  now: Date,
): { ok: true; effectiveFrom: Date } | { ok: false; error: string } {
  const requested = input.effectiveFrom.getTime();
  if (Number.isNaN(requested) || requested < now.getTime() - 60_000) return { ok: false, error: "A price can't start in the past." };
  const at = requested <= now.getTime() ? requested : Math.max(requested, now.getTime() + CATALOG_CHANGE_LEAD_MS);
  if (existing.some((p) => p.modelId === model.id && new Date(p.effectiveFrom).getTime() === at)) {
    return { ok: false, error: "This model already has a price starting then." };
  }
  if (priceConditionProblems(model, input.lines).length > 0) {
    return { ok: false, error: "A price condition names a setting this model doesn't have." };
  }
  const candidate = checkAiModelPriceRow({
    id: "new",
    model_id: model.id,
    effective_from: new Date(at).toISOString(),
    lines: input.lines,
    estimate: input.estimate,
    source_url: null,
    note: null,
  });
  if (!candidate.price) return { ok: false, error: BREAK_ERROR };
  return { ok: true, effectiveFrom: new Date(at) };
}

/**
 * The start a price or credit settings save asks for: an instant, or `now: true` for Now, which the
 * action reads from the server's clock (a browser's clock may be off).
 */
export type StartInput = { effectiveFrom: string; now?: false } | { now: true; effectiveFrom?: undefined };

/** The instant a StartInput asks for, with `now` the server's time; an invalid date for anything else. */
export function requestedStart(input: StartInput, now: Date): Date {
  return input.now === true ? now : new Date(typeof input.effectiveFrom === "string" ? input.effectiveFrom : NaN);
}

// D572 — Undo of a started change: only the latest started row, made by this admin in the last day.
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
type DatedRow = { id: string; effectiveFrom: string; createdAt: string; createdBy: string | null };

/** The started row an Undo takes back and the row before it, whose values the new row repeats. */
export function undoTarget<T extends DatedRow>(
  rows: T[],
  id: string,
  userId: string,
  now: Date,
): { ok: true; undone: T; previous: T } | { ok: false; reason: "not-undoable" | "scheduled" | "no-previous" } {
  const at = (r: DatedRow) => new Date(r.effectiveFrom).getTime();
  const started = rows.filter((r) => at(r) <= now.getTime()).sort((a, b) => at(b) - at(a));
  const undone = started[0];
  if (!undone || undone.id !== id || undone.createdBy !== userId) return { ok: false, reason: "not-undoable" };
  // Written so an unreadable created_at refuses too.
  if (!(now.getTime() - new Date(undone.createdAt).getTime() <= UNDO_WINDOW_MS)) return { ok: false, reason: "not-undoable" };
  // A scheduled row would take over from the Undo row anyway; it is cancelled first. This also stops a
  // second Undo while the first one's row waits out its lead.
  if (rows.some((r) => at(r) > now.getTime())) return { ok: false, reason: "scheduled" };
  const previous = started[1];
  if (!previous) return { ok: false, reason: "no-previous" };
  return { ok: true, undone, previous };
}

/** The note an Undo row carries, naming the undone change's start as a date in IST. */
export function undoNote(effectiveFrom: string): string {
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    .format(new Date(effectiveFrom));
  return `Undo of the ${date} change`;
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
