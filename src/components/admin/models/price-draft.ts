// The add-price form's state and how it becomes an addAiModelPriceAction payload. Pure, client-safe.
import { runPreviewUsd } from "@/lib/ai-models/model-edit";
import { usdToFinalCredits } from "@/lib/credits/units";
import { plainDecimal } from "@/lib/ai-models/price-format";
import type { AiModel, AiModelPrice, Meter, PriceLine } from "@/lib/ai-models/types";
import type { AdminPriceRow } from "@/lib/db/ai-models-admin";

export type DraftPair = { key: string; value: string };
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

/** By the key's type: `audio` is a boolean; size, resolution, quality and anything else stay text. */
export function parseConditionValue(key: string, value: string): string | boolean {
  if (key === "audio") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return value;
}

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

export function effectiveFromFor(date: string, now: Date): string {
  return date === utcDay(now) ? now.toISOString() : new Date(`${date}T00:00:00.000Z`).toISOString();
}

export const emptyLine = (): DraftLine => ({ meter: "request", unit: "", when: [] });

/** The form's starting point: what is there now, so a change is an edit of the current price. */
export function draftFromCurrent(current: AiModelPrice | null, now: Date): PriceDraft {
  return {
    date: utcDay(now),
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

/** The draft's lines as price lines, or null while one has no price. */
export function draftLines(draft: PriceDraft): PriceLine[] | null {
  const lines: PriceLine[] = [];
  for (const l of draft.lines) {
    const unit = unitFromInput(l.meter, l.unit);
    if (unit === null) return null;
    const when = l.when.filter((c) => c.key.trim() !== "");
    const line: PriceLine = { meter: l.meter, unit_usd: unit };
    if (when.length > 0) {
      line.when = Object.fromEntries(when.map((c) => [c.key.trim(), parseConditionValue(c.key.trim(), c.value)]));
    }
    lines.push(line);
  }
  return lines;
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
): { ok: true; input: PricePayload } | { ok: false; error: string } {
  const lines = draftLines(draft);
  if (!lines) return { ok: false, error: LINE_ERROR };
  const estimate = draftEstimate(draft);
  if (!estimate) return { ok: false, error: ALLOWANCE_ERROR };
  const input: PricePayload = { modelId, effectiveFrom: effectiveFromFor(draft.date, now), lines, estimate };
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
export function currentPriceRow(rows: AdminPriceRow[], now: Date): AdminPriceRow | null {
  let best: AdminPriceRow | null = null;
  for (const r of rows) {
    const at = new Date(r.effectiveFrom).getTime();
    if (!r.price || at > now.getTime()) continue;
    if (!best || at > new Date(best.effectiveFrom).getTime()) best = r;
  }
  return best;
}
