// The Credits page (D548 settings, prototype v3 "Credits"): the settings in words, the worked example,
// what typical runs cost in credits now and with new settings, each agency's month at either, and the
// settings history with Cancel and Undo where the server takes them. Client-safe.
import { currentPrice } from "@/lib/ai-models/pricing";
import { CREDIT_SETTINGS_LEAD_MS } from "@/lib/credits/settings-edit";
import { formatUsd } from "@/lib/ai-models/price-format";
import { undoTarget } from "@/lib/ai-models/model-edit";
import { creditSettingsAt, creditsFromUsd, rawCreditsFromUsd, USD_TO_CREDITS } from "@/lib/credits/units";
import type { AiCatalog, CreditSettings } from "@/lib/ai-models/types";
import { formatIstDate, formatIstWhen, formatUtcBeside, relativeIstDay } from "./ist";
import { percentChange } from "./percent-edit";
import type { PriceTimeline, TimelineItem } from "./price-sheet";
import { flatCredits, runCostUsd, runSpec, typicalRun, typicalRunRows } from "./typical-runs";
import type { AgencyChange } from "./change-prices";

export type Settings = Pick<CreditSettings, "marginPercent" | "roundStep">;
export const ROUND_STEPS = [1, 5, 10] as const;
export const MARGIN_MAX = 200;

/** "the next credit", "the next 5 credits". */
export const stepWords = (step: number) => (step === 1 ? "the next credit" : `the next ${step} credits`);
/** "margin 10%, rounds up to the next 5 credits". */
export const settingsWords = (s: Settings) => `margin ${s.marginPercent}%, rounds up to ${stepWords(s.roundStep)}`;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A credit number as shown: whole credits grouped, a flat price's fraction kept. */
export const creditNumber = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

// ─── Worked example ────────────────────────────────────────────────────────────

/** The owner's simple example: a run that costs us $0.0123. */
export const WORKED_EXAMPLE_USD = 0.0123;

export type WorkedExample = {
  usd: string;
  atCost: string;
  /** Null with no margin. */
  withMargin: string | null;
  margin: number;
  step: number;
  charged: number;
  /** What the live settings charge, when new settings charge something else. */
  was: number | null;
  sentence: string;
};

/** "A run that costs us $0.0123 is 12.3 credits, which rounds up to 15.", with these settings. */
export function workedExample(settings: Settings, live?: Settings): WorkedExample {
  const usd = WORKED_EXAMPLE_USD;
  const atCost = Math.round(usd * USD_TO_CREDITS * 1e6) / 1e6;
  const raw = rawCreditsFromUsd(usd, settings);
  const charged = creditsFromUsd(usd, settings);
  const was = live ? creditsFromUsd(usd, live) : null;
  const margin = settings.marginPercent ? `, ${creditNumber(raw)} with the ${settings.marginPercent}% margin` : "";
  const end = charged === raw ? `, which is already a whole step` : `, which rounds up to ${creditNumber(charged)}`;
  return {
    usd: formatUsd(usd),
    atCost: creditNumber(atCost),
    withMargin: settings.marginPercent ? creditNumber(raw) : null,
    margin: settings.marginPercent,
    step: settings.roundStep,
    charged,
    was: was !== null && was !== charged ? was : null,
    sentence: `A run that costs us ${formatUsd(usd)} is ${creditNumber(atCost)} credits${margin}${end}.`,
  };
}

// ─── New settings ──────────────────────────────────────────────────────────────

export const MARGIN_HINT = "Added on top of what we pay. Applies to every agency.";
export const MARGIN_ERROR = `Use a number from 0 to ${MARGIN_MAX}, with at most 2 decimals.`;

/** A typed margin ("10", "10%", "12.5"): 0 to 200 with at most 2 decimals, as the server checks. Null otherwise. */
export function parseMargin(typed: string): number | null {
  const s = typed.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > MARGIN_MAX) return null;
  return Math.abs(n * 100 - Math.round(n * 100)) > 1e-6 ? null : n;
}

/** "Margin 0% → 10%, Step 5 → 10"; empty when nothing changes. */
export function settingsChangeWords(from: Settings, to: Settings): string {
  return [
    from.marginPercent !== to.marginPercent ? `Margin ${from.marginPercent}% → ${to.marginPercent}%` : "",
    from.roundStep !== to.roundStep ? `Step ${from.roundStep} → ${to.roundStep}` : "",
  ].filter(Boolean).join(", ");
}

export const sameSettings = (a: Settings, b: Settings) => a.marginPercent === b.marginPercent && a.roundStep === b.roundStep;

// ─── Runs priced for any settings ──────────────────────────────────────────────

/** A run's cost to us, and its flat credits when it is a prompt run (D536: no margin, no step). */
export type PricedRun = { usd: number; flat: number | null };

/** What a run is charged under these settings: the same sum runCredits does. */
export const creditsFor = (run: PricedRun, s: Settings): number => run.flat ?? creditsFromUsd(run.usd, s);

export type CreditRun = PricedRun & { key: string; name: string; label: string };

/** TYPICAL_RUNS at the prices live at `at`, each with what it needs to be charged under any settings. */
export function typicalCreditRuns(catalog: Pick<AiCatalog, "models" | "prices">, at: Date): CreditRun[] {
  return typicalRunRows(catalog, at).map((r, i) => ({
    key: `${r.model.id}:${i}`,
    name: r.model.label,
    label: r.label,
    usd: r.usd,
    flat: flatCredits(r.model, r.price, r.spec),
  }));
}

/** Each model's typical run at the price live at `at`, for the agencies' months; models with no run are left out. */
export function modelTypicalRuns(catalog: Pick<AiCatalog, "models" | "prices">, modelIds: Iterable<string>, at: Date): Record<string, PricedRun> {
  const out: Record<string, PricedRun> = {};
  for (const id of new Set(modelIds)) {
    const model = catalog.models.find((m) => m.id === id);
    const price = model ? currentPrice(catalog, id, at) : null;
    const spec = model && price && typicalRun(model) ? runSpec(model, price) : null;
    const usd = model && price && spec ? runCostUsd(model, price, spec) : null;
    if (model && price && spec && usd !== null) out[id] = { usd, flat: flatCredits(model, price, spec) };
  }
  return out;
}

export const PROMPT_FLAT_NOTE = "Prompt runs are charged a flat price; margin doesn't apply.";

export type CreditRunRow = {
  key: string;
  name: string;
  label: string;
  usd: string;
  before: number;
  /** Null when only the live settings are shown. */
  after: number | null;
  percent: number | null;
  note: { tone: "rounding" | "flat"; text: string } | null;
};

/** "$0.00695 is 6.95 credits, rounded up to 10 (+44%). With a step of 1 it would be 7.", when rounding adds 15% or more. */
export function roundingNote(usd: number, s: Settings): string | null {
  const raw = rawCreditsFromUsd(usd, s);
  const charged = creditsFromUsd(usd, s);
  if (!raw) return null;
  const up = ((charged - raw) / raw) * 100;
  if (up < 15) return null;
  const alt = s.roundStep === 1 ? "" : ` With a step of 1 it would be ${creditNumber(creditsFromUsd(usd, { ...s, roundStep: 1 }))}.`;
  return `${formatUsd(usd)} is ${creditNumber(raw)} credits, rounded up to ${creditNumber(charged)} (+${Math.round(up)}%).${alt}`;
}

/** The typical-runs table: credits now and, with new settings, after, with a note where rounding dominates or the run is flat. */
export function creditRunRows(runs: readonly CreditRun[], before: Settings, after: Settings | null): CreditRunRow[] {
  return runs.map((r) => {
    const b = creditsFor(r, before);
    const a = after ? creditsFor(r, after) : null;
    const rounding = r.flat === null ? roundingNote(r.usd, after ?? before) : null;
    return {
      key: r.key,
      name: r.name,
      label: r.label,
      usd: formatUsd(r.usd),
      before: b,
      after: a,
      percent: a === null || a === b ? null : percentChange(b, a),
      note: r.flat !== null ? { tone: "flat", text: PROMPT_FLAT_NOTE } : rounding ? { tone: "rounding", text: rounding } : null,
    };
  });
}

/** This month's runs per agency and model, as the grouped query returns them. */
export type AgencyModelRuns = { modelId: string; orgId: string; orgName: string; runs: number };

/** Each agency's month: its runs, and those runs at each model's typical run in credits, before and after. Busiest first. */
export function agencyCreditImpact(
  rows: readonly AgencyModelRuns[],
  runs: Readonly<Record<string, PricedRun>>,
  before: Settings,
  after: Settings,
): AgencyChange[] {
  const by = new Map<string, { name: string; runs: number; before: number; after: number; priced: boolean }>();
  for (const r of rows) {
    const a = by.get(r.orgId) ?? { name: r.orgName, runs: 0, before: 0, after: 0, priced: false };
    a.runs += r.runs;
    const run = runs[r.modelId];
    if (run) {
      a.before += r.runs * creditsFor(run, before);
      a.after += r.runs * creditsFor(run, after);
      a.priced = true;
    }
    by.set(r.orgId, a);
  }
  return [...by.values()]
    .sort((x, y) => y.runs - x.runs || x.name.localeCompare(y.name))
    .map((a) => {
      const b = a.priced ? round6(a.before) : null;
      const f = a.priced ? round6(a.after) : null;
      return { name: a.name, runs: a.runs, before: b, after: f, percent: percentChange(b, f) };
    });
}
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// ─── Summary and history ───────────────────────────────────────────────────────

/** The summary card: the live settings and the next change. */
export function creditsSummary(rows: readonly CreditSettings[], live: Settings, now: Date): { line: string; next: { when: string; utc: string; text: string } | null } {
  const next = [...rows].filter((r) => Date.parse(r.effectiveFrom) > now.getTime()).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  const at = next ? new Date(next.effectiveFrom) : null;
  return {
    line: `1 credit = $0.001 · margin ${live.marginPercent}% · rounds up to ${stepWords(live.roundStep)}`,
    next: next && at ? { when: formatIstWhen(at), utc: formatUtcBeside(at), text: `${settingsWords(next)}.` } : null,
  };
}

/**
 * For each scheduled change, the settings runs keep if it is cancelled (the ones in force at its start
 * without it), for the cancel dialog: "Runs keep margin 0%, rounds up to the next 5 credits."
 */
export function keptOnCancel(rows: readonly CreditSettings[], now: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (Date.parse(r.effectiveFrom) <= now.getTime()) continue;
    const kept = creditSettingsAt({ creditSettings: rows.filter((x) => x.id !== r.id) }, new Date(r.effectiveFrom));
    out[r.id] = `Runs keep ${settingsWords(kept)}.`;
  }
  return out;
}

/** A credit settings row as the page reads it; `settings` is null when the row fails its check. */
export type CreditHistoryRow = {
  id: string;
  effectiveFrom: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  settings: CreditSettings | null;
  problems: string[];
};

/**
 * The settings history, newest first, in the price history's shape. Cancel and Undo follow the
 * server: Cancel only outside the 2-minute lead; Undo only on the live row when undoTarget takes it
 * and the row before it passes its check.
 */
export function creditHistory(rows: readonly CreditHistoryRow[], ctx: { now: Date; callerId: string }): PriceTimeline {
  const now = ctx.now.getTime();
  const t = (r: CreditHistoryRow) => new Date(r.effectiveFrom).getTime();
  const sorted = [...rows].sort((a, b) => t(b) - t(a) || b.createdAt.localeCompare(a.createdAt));
  const current = sorted.find((r) => r.settings && t(r) <= now) ?? null;
  const undo = current ? undoTarget([...rows], current.id, ctx.callerId, ctx.now) : null;
  const canUndoCurrent = !!undo && undo.ok && undo.previous.settings !== null;

  const items = sorted.map((r, i): TimelineItem => {
    const at = new Date(r.effectiveFrom);
    const future = t(r) > now;
    const state = future ? "next" : r === current ? "now" : "past";
    const prev = sorted.slice(i + 1).find((x) => x.settings)?.settings ?? null;
    const s = r.settings;
    return {
      id: r.id,
      state,
      broken: !s,
      when: future ? `From ${formatIstWhen(at)}` : `Since ${formatIstDate(at)}`,
      utc: future ? formatUtcBeside(at) : null,
      badge: !s ? "Fails its check" : state === "now" ? "Live now" : state === "next" ? `Next, ${relativeIstDay(at, ctx.now)}` : "Past",
      summary: s ? (prev ? settingsChangeWords(prev, s) || "No change" : capitalise(settingsWords(s))) : null,
      note: s?.note ?? null,
      problems: s ? [] : r.problems,
      who: `Added ${r.createdByName ? `by ${r.createdByName} ` : ""}on ${formatIstDate(new Date(r.createdAt))}`,
      canCancel: future && t(r) > now + CREDIT_SETTINGS_LEAD_MS,
      canUndo: r === current && canUndoCurrent,
      name: `the ${formatIstDate(at, false)} change`,
    };
  });
  return { items, source: null };
}
