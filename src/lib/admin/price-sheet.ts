// The admin model page's price sheet and side column (prototype v3, "Model"): the sheet's title and
// footnote, credits per cell, the scheduled-change notice, "Try a run" and the price history.
// Credits use the credit settings row live now (D571); runs use the same estimators a real run
// reserves with (typical-runs.ts). Client-safe.
import { formatUsd, isTokenMeter } from "@/lib/ai-models/price-format";
import { CATALOG_CHANGE_LEAD_MS } from "@/lib/ai-models/pricing";
import { undoTarget } from "@/lib/ai-models/model-edit";
import { rawCreditsFromUsd } from "@/lib/credits/units";
import { SEED_PRICE_NOTE } from "@/lib/ai-models/seed";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { lineKey, meterLabel, priceGrid } from "./price-grid";
import { changeWords, priceDiff } from "./models-list";
import { runCostUsd, runCredits, runSpec, specLabel, typicalRun, type RunChoice } from "./typical-runs";
import { formatIstDate, formatIstWhen, formatUtcBeside, relativeIstDay } from "./ist";
import { percentChange, percentChipText } from "./percent-edit";
import { stepWords } from "./credits-page";

type Settings = Pick<CreditSettings, "marginPercent" | "roundStep">;
type SheetModel = Pick<AiModel, "id" | "kind" | "label" | "params" | "providerLabel">;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hasGrid = (kind: string) => kind === "image" || kind === "video";
/** A price row's note as shown: the seed's internal note is left out. */
const shownNote = (note: string | null) => (note === SEED_PRICE_NOTE ? null : note);

/** The price sheet's title: the main price's unit. */
export function sheetTitle(kind: string): string {
  if (kind === "video") return "Per second of video";
  if (kind === "image") return "Per image";
  return "Prices";
}

/** Credits for one unit before a run is rounded up, with the live margin: "33.79". */
export function cellCredits(usd: number, settings: Pick<Settings, "marginPercent">): string {
  return Number(rawCreditsFromUsd(usd, settings).toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** One footnote, with only what applies to this model's price. Null when nothing does. */
export function sheetFootnote(model: Pick<AiModel, "kind">, price: Pick<AiModelPrice, "lines"> | null, settings: Settings): string | null {
  if (!price || !price.lines.length) return null;
  const bits: string[] = [];
  if (hasGrid(model.kind)) {
    const margin = settings.marginPercent ? `, with the ${settings.marginPercent}% margin,` : "";
    bits.push(`Credits are shown ${model.kind === "image" ? "per image" : "per second"}${margin} before a run is rounded up to ${stepWords(settings.roundStep)}.`);
  }
  if (price.lines.some((l) => isTokenMeter(l.meter))) bits.push("Token prices are per 1M tokens.");
  if (model.kind === "image" && price.lines.some((l) => isTokenMeter(l.meter) || l.meter === "input_image")) {
    bits.push("A typical run adds the prompt and one reference image.");
  }
  return bits.length ? bits.join(" ") : null;
}

const orList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

/** The empty sheet's text: why a price is needed, and the settings the admin will price. */
export function noPriceText(model: SheetModel, status: string): string {
  const lead = `Runs can't be charged without one${status === "draft" ? `, so ${model.label} stays a draft` : ""}.`;
  if (!hasGrid(model.kind)) return lead;
  const g = priceGrid(model, { id: "", modelId: model.id, effectiveFrom: "", lines: [], estimate: {}, sourceUrl: null, note: null });
  if (!g.rowAxis) return lead;
  const rows = g.rowValues.map((r) => r.label).join(", ");
  let each = "";
  if (g.colAxis?.key === "quality") each = `, each at ${orList(g.colValues.map((c) => c.label))} quality`;
  else if (model.kind === "video" && model.params.some((p) => p.name === "audio")) each = ", each with audio and no audio";
  return `${lead} You'll enter a price for each of its settings: ${rows}${each}.`;
}

const signed = (p: number) => `${p < 0 ? "−" : "+"}${Math.abs(p)}%`;

/** How a price row moved prices from the row before it: "5 prices −31%", "Starting price". */
export function diffSummary(prev: Pick<AiModelPrice, "lines"> | null, next: Pick<AiModelPrice, "lines">, provider = "provider"): string {
  if (!prev) return "Starting price";
  const d = priceDiff(prev, next);
  const bits: string[] = [];
  if (d.changed.length) {
    const ps = d.changed.map((c) => Math.round(c.percent ?? 0));
    const min = Math.min(...ps);
    const max = Math.max(...ps);
    const n = d.changed.length;
    const all = n === next.lines.length && n > 1;
    bits.push(min === max ? `${n === 1 ? "1 price" : all ? `All ${n} prices` : `${n} prices`} ${signed(min)}` : `${n} prices ${signed(min)} to ${signed(max)}`);
  }
  if (d.added) {
    const old = new Set(prev.lines.map((l) => lineKey(l.meter, l.when)));
    const first = next.lines.find((l) => !old.has(lineKey(l.meter, l.when)));
    bits.push(d.added === 1 && first ? `Adds the price ${meterLabel(first.meter, { providerLabel: provider })}` : `Adds ${d.added} prices`);
  }
  if (d.removed) bits.push(`Removes ${d.removed === 1 ? "1 price" : `${d.removed} prices`}`);
  return bits.join(" · ") || "No price changes";
}

export type ScheduledNotice = { headline: string; when: string; utc: string; note: string | null };

/** The notice above the sheet when a price change is scheduled: "Prices drop 31% from 3 Dec 2026, 13:30 IST, in 9 days." */
export function scheduledNotice(current: Pick<AiModelPrice, "lines"> | null, next: AiModelPrice, now: Date): ScheduledNotice {
  const at = new Date(next.effectiveFrom);
  return {
    headline: capitalise(changeWords(current ? priceDiff(current, next) : null)),
    when: `from ${formatIstWhen(at)}, ${relativeIstDay(at, now)}.`,
    utc: formatUtcBeside(at),
    note: shownNote(next.note),
  };
}

/** A price row as the page reads it; `price` is null when the row fails its check (D570). */
export type TimelineInputRow = {
  id: string;
  effectiveFrom: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  price: AiModelPrice | null;
  problems: string[];
};

export type TimelineItem = {
  id: string;
  state: "now" | "next" | "past";
  broken: boolean;
  when: string;
  /** The UTC time under a scheduled start; null for a date with no time. */
  utc: string | null;
  badge: string;
  summary: string | null;
  note: string | null;
  problems: string[];
  who: string;
  /** Hasn't started and is outside the 2-minute lead, so cancelAiModelPriceAction takes it. */
  canCancel: boolean;
  /** undoAiModelPriceAction takes it: the latest started change, by this admin, in the last 24 hours. */
  canUndo: boolean;
  /** Plain words for the change, for dialogs and toasts: "the 3 Dec change". */
  name: string;
};

export type PriceTimeline = { items: TimelineItem[]; source: { href: string; text: string } | null };

/** The price history, newest first. The live row is the latest started row that passes its check. */
export function priceTimeline(rows: readonly TimelineInputRow[], ctx: { now: Date; provider: string; callerId: string }): PriceTimeline {
  if (!rows.length) return { items: [], source: null };
  const now = ctx.now.getTime();
  const t = (r: TimelineInputRow) => new Date(r.effectiveFrom).getTime();
  const sorted = [...rows].sort((a, b) => t(b) - t(a) || b.createdAt.localeCompare(a.createdAt));
  const current = sorted.find((r) => r.price && t(r) <= now) ?? null;
  const undo = current ? undoTarget([...rows], current.id, ctx.callerId, ctx.now) : null;
  const canUndoCurrent = !!undo && undo.ok && undo.previous.price !== null;

  const items = sorted.map((r, i): TimelineItem => {
    const at = new Date(r.effectiveFrom);
    const future = t(r) > now;
    const state = future ? "next" : r === current ? "now" : "past";
    const prev = sorted.slice(i + 1).find((x) => x.price) ?? null;
    const badge = !r.price ? "Fails its check" : state === "now" ? "Live now" : state === "next" ? `Next, ${relativeIstDay(at, ctx.now)}` : "Past";
    return {
      id: r.id,
      state,
      broken: !r.price,
      when: future ? `From ${formatIstWhen(at)}` : `Since ${formatIstDate(at)}`,
      utc: future ? formatUtcBeside(at) : null,
      badge,
      // The oldest row has nothing to compare with, so it has no summary (as in the prototype).
      summary: r.price && prev?.price ? `${diffSummary(prev.price, r.price, ctx.provider)}.` : null,
      note: shownNote(r.price?.note ?? null),
      problems: r.price ? [] : r.problems,
      who: `Added ${r.createdByName ? `by ${r.createdByName} ` : ""}on ${formatIstDate(new Date(r.createdAt))}`,
      canCancel: future && t(r) > now + CATALOG_CHANGE_LEAD_MS,
      canUndo: r === current && canUndoCurrent,
      name: `the ${formatIstDate(at, false)} change`,
    };
  });
  const withSource = sorted.find((r) => r.price?.sourceUrl);
  const source = withSource?.price?.sourceUrl ? { href: withSource.price.sourceUrl, text: `${ctx.provider}'s pricing page` } : null;
  return { items, source };
}

/** The lengths "Try a run" offers: the model's duration options, or a few steps across its range. */
export function lengthOptions(model: Pick<AiModel, "params">): number[] {
  const c = model.params.find((p) => p.name === "duration")?.constraints;
  if (c?.type === "select") return c.options.map(Number).filter((n) => Number.isFinite(n));
  if ((c?.type === "slider" || c?.type === "number") && c.min !== undefined && c.max !== undefined) {
    const { min, max } = c;
    return [...new Set([min, 5, 8, 10, max])].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
  }
  return [8];
}

export type RunOptionValue = string | number | boolean;
export type RunOptionGroup = {
  field: "seconds" | "row" | "col" | "references";
  label: string;
  options: Array<{ value: RunOptionValue; label: string }>;
};

/** The choices "Try a run" offers for this model: length, the price grid's settings, references. */
export function tryRunOptions(model: SheetModel, price: AiModelPrice): RunOptionGroup[] {
  const base = typicalRun(model);
  if (!base || (base.kind !== "image" && base.kind !== "video")) return [];
  const g = priceGrid(model, price);
  const groups: RunOptionGroup[] = [];
  if (base.kind === "video") groups.push({ field: "seconds", label: "Length", options: lengthOptions(model).map((n) => ({ value: n, label: `${n} s` })) });
  if (g.rowAxis && g.rowValues.length > 1) {
    groups.push({ field: "row", label: g.rowAxis.label, options: g.rowValues.map((v) => ({ value: v.value as RunOptionValue, label: v.label })) });
  }
  if (g.colAxis && g.colValues.length > 1) {
    groups.push({ field: "col", label: g.colAxis.label, options: g.colValues.map((v) => ({ value: v.value as RunOptionValue, label: v.label })) });
  }
  if (base.kind === "image") groups.push({ field: "references", label: "References", options: [0, 1, 3].map((n) => ({ value: n, label: String(n) })) });
  return groups;
}

export type TryARunResult = {
  label: string;
  /** Null when the chosen setting has no price. */
  credits: number | null;
  usd: number | null;
  /** The live price's run, when a scheduled price is shown and the run costs differ. */
  before: { credits: number | null; usd: number } | null;
  text: string;
  /** The change in credits when comparing: "−31%" and the percent it was worked from. */
  percent: { text: string; value: number } | null;
};

/** One run at the chosen settings, in credits at the live settings; against `compare` when a scheduled price is shown. */
export function tryARun(
  model: SheetModel,
  price: AiModelPrice,
  compare: AiModelPrice | null,
  choice: RunChoice,
  settings: Settings,
): TryARunResult | null {
  const spec = runSpec(model, price, choice);
  if (!spec) return null;
  const label = specLabel(model, price, spec);
  const usd = runCostUsd(model, price, spec);
  if (usd === null) return { label, credits: null, usd: null, before: null, text: "No price for this setting", percent: null };
  const credits = runCredits(model, price, spec, settings);
  const cSpec = compare ? runSpec(model, compare, choice) : null;
  const cUsd = compare && cSpec ? runCostUsd(model, compare, cSpec) : null;
  if (compare && cSpec && cUsd !== null && Math.abs(cUsd - usd) > 1e-12) {
    const cCredits = runCredits(model, compare, cSpec, settings);
    const same = cCredits !== null && cCredits === credits;
    const p = same ? null : percentChange(cCredits, credits);
    const text = percentChipText(p);
    return {
      label,
      credits,
      usd,
      before: { credits: cCredits, usd: cUsd },
      text: `${same ? "No change in credits. " : ""}We pay ${formatUsd(usd)} instead of ${formatUsd(cUsd)}`,
      percent: p !== null && text !== null ? { text, value: p } : null,
    };
  }
  const margin = settings.marginPercent ? `, plus ${settings.marginPercent}% margin` : "";
  return { label, credits, usd, before: null, text: `We pay ${formatUsd(usd)}${margin}, rounded up to ${stepWords(settings.roundStep)}`, percent: null };
}
