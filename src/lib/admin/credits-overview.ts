// D594 — the simple Credits page: the Now and Next rows, the one run the Next row names, the three
// example runs the change flow shows, and what held credits buy after a change. Client-safe.
import { CREDIT_SETTINGS_LEAD_MS } from "@/lib/credits/settings-edit";
import { creditSettingsAt, DEFAULT_CREDIT_SETTINGS } from "@/lib/credits/units";
import type { AiCatalog, CreditSettings } from "@/lib/ai-models/types";
import { formatIstDate, formatIstWhen, formatUtcBeside, relativeIstDay } from "./ist";
import { percentChange, percentChipText } from "./percent-edit";
import type { AgencyChange } from "./change-prices";
import {
  agencyCreditImpact,
  creditNumber,
  creditsFor,
  keptOnCancel,
  modelTypicalRuns,
  settingsChangeWords,
  stepWords,
  type AgencyModelRuns,
  type CreditRun,
  type CreditRunRow,
  type PricedRun,
  type Settings,
} from "./credits-page";

/** What a run mix is worked out from: the typical runs, and this month's runs by agency and model. */
export type RunMix = {
  runs: readonly CreditRun[];
  agencyRuns: readonly AgencyModelRuns[];
  modelRuns: Readonly<Record<string, PricedRun>>;
};

// ─── The run the Next row names ────────────────────────────────────────────────

export type ReferenceRun = PricedRun & { name: string };

/**
 * The run the Next row puts in numbers: the typical run of the model with the most runs this month
 * (ties by model id), else the first live video model in picker order. A run charged flat is skipped,
 * since a change never moves it. Null when no model has a priced run.
 */
export function referenceRun(catalog: Pick<AiCatalog, "models" | "prices">, agencyRuns: readonly AgencyModelRuns[], at: Date): ReferenceRun | null {
  const totals = new Map<string, number>();
  for (const r of agencyRuns) totals.set(r.modelId, (totals.get(r.modelId) ?? 0) + r.runs);
  const busiest = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
  const videos = catalog.models
    .filter((m) => m.kind === "video" && m.status === "live")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((m) => m.id);
  const order = [...busiest, ...videos];
  const priced = modelTypicalRuns(catalog, order, at);
  for (const id of order) {
    const run = priced[id];
    const model = catalog.models.find((m) => m.id === id);
    if (run && run.flat === null && model) return { ...run, name: model.label };
  }
  return null;
}

/** Up to three typical runs that read in plain words: the first run of each kind that a change moves. */
export function exampleRuns<T extends CreditRun>(runs: readonly T[]): T[] {
  const out: T[] = [];
  for (const r of runs) {
    if (out.length === 3) break;
    if (r.flat === null && !out.some((o) => o.kind === r.kind)) out.push(r);
  }
  return out;
}

// ─── Held credits and the agencies' month ──────────────────────────────────────

/** This month's credits over every agency, from each model's typical run, before and after. Null with no priced runs. */
function monthTotals(agencies: readonly AgencyChange[]): { before: number; after: number } | null {
  const priced = agencies.filter((a) => a.before !== null && a.after !== null);
  if (!priced.length) return null;
  return { before: priced.reduce((n, a) => n + (a.before ?? 0), 0), after: priced.reduce((n, a) => n + (a.after ?? 0), 0) };
}

/**
 * How many more (positive) or fewer (negative) runs the credits agencies hold buy after a change, in
 * percent: weighted by this month's runs of each model when there are any, else by the typical runs.
 */
export function heldRunsChange(before: Settings, after: Settings, mix: RunMix): number | null {
  const month = monthTotals(agencyCreditImpact(mix.agencyRuns, mix.modelRuns, before, after));
  const totals = month ?? {
    before: mix.runs.reduce((n, r) => n + creditsFor(r, before), 0),
    after: mix.runs.reduce((n, r) => n + creditsFor(r, after), 0),
  };
  if (!totals.before || !totals.after) return null;
  return (totals.before / totals.after - 1) * 100;
}

/** "Credits agencies hold buy about 9% fewer runs." */
export function heldWords(p: number | null): string | null {
  if (p === null) return null;
  const r = Math.round(Math.abs(p));
  if (r === 0) return "Credits agencies hold buy about the same number of runs.";
  return `Credits agencies hold buy about ${r}% ${p < 0 ? "fewer" : "more"} runs.`;
}

/** "The 3 agencies with runs this month would have used about 9% more credits for the same work." Null with no priced runs. */
export function agencyMonthWords(agencies: readonly AgencyChange[]): string | null {
  const t = monthTotals(agencies);
  const p = t ? percentChange(t.before, t.after) : null;
  if (!t || p === null) return null;
  const who = agencies.length === 1 ? "The one agency" : `The ${agencies.length} agencies`;
  const r = Math.round(Math.abs(p));
  const how = r === 0 ? "about the same credits" : `about ${r}% ${p > 0 ? "more" : "fewer"} credits`;
  return `${who} with runs this month would have used ${how} for the same work.`;
}

/**
 * Typical runs that rise clearly more than the mix (10 points or more), because rounding up weighs
 * more on cheap runs: "GPT Image 2, low quality square image (+44%) rises more than the rest, …".
 */
export function roundingPushWords(rows: readonly CreditRunRow[]): string | null {
  const before = rows.reduce((n, r) => n + r.before, 0);
  const after = rows.reduce((n, r) => n + (r.after ?? r.before), 0);
  const overall = percentChange(before, after) ?? 0;
  const big = rows.filter((r) => r.percent !== null && r.percent > 0 && r.percent - overall >= 10 - 1e-9);
  if (!big.length) return null;
  const names = big.map((r) => `${r.name}, ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)} (${percentChipText(r.percent)})`);
  return `${names.join("; ")} ${big.length === 1 ? "rises" : "rise"} more than the rest, because rounding weighs more on cheap runs.`;
}

// ─── The Now and Next rows ─────────────────────────────────────────────────────

/** "Margin 0% · rounds up to the next 5 credits". */
export const settingsLine = (s: Settings) => `Margin ${s.marginPercent}% · rounds up to ${stepWords(s.roundStep)}`;

/** The Now row: the live settings and since when. With no row in force, the defaults runs use. */
export function nowRow(live: CreditSettings): { line: string; since: string } {
  return {
    line: settingsLine(live),
    since: live.id === DEFAULT_CREDIT_SETTINGS.id ? "Default, none saved yet" : `Since ${formatIstDate(new Date(live.effectiveFrom))}`,
  };
}

export type NextChange = {
  id: string;
  /** "the 1 Dec change". */
  name: string;
  /** "1 Dec 2026, 00:00 IST". */
  when: string;
  /** "18:30 UTC on 30 Nov". */
  utc: string;
  /** "in 5 days". */
  relative: string;
  /** "Margin 0% → 10%". */
  lead: string;
  /** "A typical Kling 3.0 run goes from 620 to 685 credits." */
  run: string | null;
  held: string | null;
  /** Changes scheduled after this one. */
  more: number;
  /** False inside the lead: the server refuses a cancel then. */
  canCancel: boolean;
  /** "Runs keep margin 0%, rounds up to the next 5 credits." */
  kept: string;
  /** The row as saved, so Undo after a cancel can save it again. */
  restore: { effectiveFrom: string; marginPercent: number; roundStep: number; note: string | null };
};

/** The Next row: the first change that hasn't started, compared with the settings in force just before it. */
export function nextCreditChange(a: { settings: readonly CreditSettings[]; now: Date; reference: ReferenceRun | null } & RunMix): NextChange | null {
  const t = (s: CreditSettings) => Date.parse(s.effectiveFrom);
  const future = a.settings.filter((s) => t(s) > a.now.getTime()).sort((x, y) => t(x) - t(y));
  const next = future[0];
  if (!next) return null;
  const at = new Date(next.effectiveFrom);
  const before = creditSettingsAt({ creditSettings: a.settings.filter((s) => s.id !== next.id) }, new Date(at.getTime() - 1));
  const ref = a.reference;
  const from = ref ? creditsFor(ref, before) : 0;
  const to = ref ? creditsFor(ref, next) : 0;
  return {
    id: next.id,
    name: `the ${formatIstDate(at, false)} change`,
    when: formatIstWhen(at),
    utc: formatUtcBeside(at),
    relative: relativeIstDay(at, a.now),
    lead: settingsChangeWords(before, next) || "The same settings as before it",
    run: !ref
      ? null
      : from === to
        ? `A typical ${ref.name} run stays at ${creditNumber(from)} credits.`
        : `A typical ${ref.name} run goes from ${creditNumber(from)} to ${creditNumber(to)} credits.`,
    held: heldWords(heldRunsChange(before, next, a)),
    more: future.length - 1,
    canCancel: t(next) > a.now.getTime() + CREDIT_SETTINGS_LEAD_MS,
    kept: keptOnCancel(a.settings, a.now)[next.id] ?? "",
    restore: { effectiveFrom: next.effectiveFrom, marginPercent: next.marginPercent, roundStep: next.roundStep, note: next.note },
  };
}
