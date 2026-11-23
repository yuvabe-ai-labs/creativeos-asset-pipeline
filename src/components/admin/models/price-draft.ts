// The add-price form's state and how it becomes an addAiModelPriceAction payload. Pure, client-safe.
import { estimateAllowanceKeys, runPreviewUsd } from "@/lib/ai-models/model-edit";
import { usdToFinalCredits } from "@/lib/credits/units";
import { plainDecimal } from "@/lib/ai-models/price-format";
import type { AiModel, AiModelPrice, Meter, PriceLine } from "@/lib/ai-models/types";
import type { AdminPriceRow } from "@/lib/db/ai-models-admin";

/** `custom`: the admin chose to type the name (an allowance) rather than pick one. */
export type DraftPair = { key: string; value: string; custom?: boolean };
export type DraftLine = { meter: Meter; unit: string; when: DraftPair[] };
export type PriceDraft = {
  /** yyyy-mm-dd (UTC). Today means now; a later day means 00:00 UTC that day. */
  date: string;
  lines: DraftLine[];
  estimate: DraftPair[];
  sourceUrl: string;
  note: string;
};
export type PricePayload = {
  modelId: string;
  effectiveFrom: string;
  lines: PriceLine[];
  estimate: Record<string, number>;
  sourceUrl?: string;
  note?: string;
};

const LINE_ERROR = "Enter a price for every line.";
const ALLOWANCE_ERROR = "Enter a number for every allowance.";
const DATE_ERROR = "Pick a start date.";
const EMPTY_CONDITION_ERROR = "Fill in or remove the empty condition.";
const REPEATED_CONDITION_ERROR = "Each setting can appear once per line.";

const UNKNOWN_ALLOWANCE = "No estimate reads this name.";

/** The allowance names to offer: the ones the estimator reads, then any other on the current row. */
export function allowanceOptions(model: Pick<AiModel, "id" | "kind" | "params">, current: AiModelPrice | null): string[] {
  return [...new Set([...estimateAllowanceKeys(model), ...Object.keys(current?.estimate ?? {})])];
}

/** A warning for a name no estimate reads. It doesn't stop the save. */
export function allowanceWarning(model: Pick<AiModel, "id" | "kind" | "params">, key: string): string | null {
  const k = key.trim();
  return k === "" || estimateAllowanceKeys(model).includes(k) ? null : UNKNOWN_ALLOWANCE;
}

export const isTokenMeter = (meter: Meter): boolean => meter.endsWith("_token");

/** What the $ field shows: token meters per 1M tokens (as providers list them), others per unit. */
export function unitToInput(meter: Meter, unitUsd: number): string {
  const n = isTokenMeter(meter) ? unitUsd * 1e6 : unitUsd;
  return plainDecimal(parseFloat(n.toPrecision(12)));
}

/** The line's unit_usd from the $ field, or null when it isn't a price. */
export function unitFromInput(meter: Meter, text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return isTokenMeter(meter) ? parseFloat((n / 1e6).toPrecision(12)) : n;
}

/** A new meter for a line. The amount is cleared when it moves between per-1M-token and per-unit. */
export function switchMeter(line: DraftLine, meter: Meter): DraftLine {
  return isTokenMeter(meter) === isTokenMeter(line.meter) ? { ...line, meter } : { ...line, meter, unit: "" };
}

/** By the key's type: `audio` is a boolean; size, resolution, quality and anything else stay text. */
export function parseConditionValue(key: string, value: string): string | boolean {
  const v = value.trim();
  if (key === "audio") {
    if (v.toLowerCase() === "true") return true;
    if (v.toLowerCase() === "false") return false;
  }
  return v;
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);
export const utcDay = dayOf;

/** The admin's own calendar day. `offsetMinutes` is getTimezoneOffset() (India: -330). */
export function localDay(now: Date, offsetMinutes = now.getTimezoneOffset()): string {
  return dayOf(new Date(now.getTime() - offsetMinutes * 60_000));
}

/** The earliest day the field allows: the earlier of the local day and the UTC day. */
export function minStartDay(now: Date, offsetMinutes = now.getTimezoneOffset()): string {
  const local = localDay(now, offsetMinutes);
  const utc = utcDay(now);
  return local < utc ? local : utc;
}

/** 00:00 UTC that day, or null when `date` is not a real yyyy-mm-dd day. */
function dayStart(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const at = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(at.getTime()) || dayOf(at) !== date ? null : at;
}

/**
 * Any day up to and including the admin's local today means now; a later day means 00:00 UTC
 * that day (never before now). `localToday` comes from the browser clock (localDay), so a sheet
 * left open across midnight still saves "now" rather than being refused as past.
 */
export function effectiveFromFor(date: string, now: Date, localToday: string): string | null {
  const start = dayStart(date);
  if (!start) return null;
  if (date <= localToday) return now.toISOString();
  return (start.getTime() > now.getTime() ? start : now).toISOString();
}

export const emptyLine = (): DraftLine => ({ meter: "request", unit: "", when: [] });

/** The form's starting point: what is there now, so a change is an edit of the current price. */
export function draftFromCurrent(current: AiModelPrice | null, now: Date): PriceDraft {
  return {
    date: localDay(now),
    lines: current
      ? current.lines.map((l) => ({
          meter: l.meter,
          unit: unitToInput(l.meter, l.unit_usd),
          when: Object.entries(l.when ?? {}).map(([key, value]) => ({ key, value: String(value) })),
        }))
      : [emptyLine()],
    estimate: current ? Object.entries(current.estimate).map(([key, value]) => ({ key, value: String(value) })) : [],
    sourceUrl: current?.sourceUrl ?? "",
    note: "",
  };
}

/**
 * The draft's lines as price lines, or null while one has no price. Conditions with only a key
 * or only a value are left out; `conditionError` says why the draft can't be saved that way.
 */
export function draftLines(draft: PriceDraft): PriceLine[] | null {
  const lines: PriceLine[] = [];
  for (const l of draft.lines) {
    const unit = unitFromInput(l.meter, l.unit);
    if (unit === null) return null;
    const when = l.when
      .map((c) => ({ key: c.key.trim(), value: c.value.trim() }))
      .filter((c) => c.key !== "" && c.value !== "");
    const line: PriceLine = { meter: l.meter, unit_usd: unit };
    if (when.length > 0) line.when = Object.fromEntries(when.map((c) => [c.key, parseConditionValue(c.key, c.value)]));
    lines.push(line);
  }
  return lines;
}

function conditionError(draft: PriceDraft): string | null {
  for (const l of draft.lines) {
    const keys = new Set<string>();
    for (const c of l.when) {
      const key = c.key.trim();
      const value = c.value.trim();
      if (key === "" && value === "") continue;
      if (key === "" || value === "") return EMPTY_CONDITION_ERROR;
      if (keys.has(key)) return REPEATED_CONDITION_ERROR;
      keys.add(key);
    }
  }
  return null;
}

function draftEstimate(draft: PriceDraft): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const a of draft.estimate) {
    if (a.key.trim() === "" && a.value.trim() === "") continue;
    const n = Number(a.value);
    if (a.key.trim() === "" || a.value.trim() === "" || !Number.isFinite(n)) return null;
    out[a.key.trim()] = n;
  }
  return out;
}

export function draftToPayload(
  modelId: string,
  draft: PriceDraft,
  now: Date,
  localToday: string,
): { ok: true; input: PricePayload } | { ok: false; error: string } {
  const effectiveFrom = effectiveFromFor(draft.date, now, localToday);
  if (!effectiveFrom) return { ok: false, error: DATE_ERROR };
  const lines = draftLines(draft);
  if (!lines) return { ok: false, error: LINE_ERROR };
  const problem = conditionError(draft);
  if (problem) return { ok: false, error: problem };
  const estimate = draftEstimate(draft);
  if (!estimate) return { ok: false, error: ALLOWANCE_ERROR };
  const input: PricePayload = { modelId, effectiveFrom, lines, estimate };
  if (draft.sourceUrl.trim() !== "") input.sourceUrl = draft.sourceUrl.trim();
  if (draft.note.trim() !== "") input.note = draft.note.trim();
  return { ok: true, input };
}

/** The live preview line under the form. */
export function previewText(model: AiModel, draft: PriceDraft, current: AiModelPrice | null): string {
  if (model.kind !== "image" && model.kind !== "video") return "No run preview for this kind of model.";
  const lines = draftLines(draft);
  if (!lines) return "Fill in every price to see a default run.";
  const price: AiModelPrice = {
    id: "draft",
    modelId: model.id,
    effectiveFrom: "",
    lines,
    estimate: draftEstimate(draft) ?? {},
    sourceUrl: null,
    note: null,
  };
  const usd = runPreviewUsd(model, price);
  if (usd === null) return "No line prices a run at the default settings.";
  const wasUsd = current ? runPreviewUsd(model, current) : null;
  const was = wasUsd === null ? "" : ` (was ${usdToFinalCredits(wasUsd)})`;
  return `A default run: ${usdToFinalCredits(usd)} credits${was}`;
}

/** The row in effect now: the newest one that has started and passes its check. */
export function currentPriceRow<T extends Pick<AdminPriceRow, "price" | "effectiveFrom">>(rows: T[], now: Date): T | null {
  let best: T | null = null;
  for (const r of rows) {
    const at = new Date(r.effectiveFrom).getTime();
    if (!r.price || at > now.getTime()) continue;
    if (!best || at > new Date(best.effectiveFrom).getTime()) best = r;
  }
  return best;
}
