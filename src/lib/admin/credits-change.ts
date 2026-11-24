// The change-credit-settings flow on the Credits page: When (tomorrow 00:00 IST first, Now allowed
// with a warning), the Review (typical runs and agencies before and after, notes), and the toast's
// words and Undo after saving. Mirrors the server's D548 checks. Client-safe.
import { CREDIT_SETTINGS_LEAD_MS } from "@/lib/credits/settings-edit";
import { creditSettingsAt } from "@/lib/credits/units";
import type { CreditSettings } from "@/lib/ai-models/types";
import { whenInstant, whenProblem, type When } from "./change-prices-when";
import type { AgencyChange } from "./change-prices";
import { addIstDays, formatIstDate, formatIstTime, formatIstWhen, relativeIstDay, todayIst } from "./ist";
import { percentChange } from "./percent-edit";
import {
  agencyCreditImpact,
  creditRunRows,
  creditsFor,
  sameSettings,
  settingsChangeWords,
  type AgencyModelRuns,
  type CreditRun,
  type CreditRunRow,
  type PricedRun,
  type Settings,
} from "./credits-page";

/** Every change starts this long after it is saved at the earliest; the server moves a sooner start. */
export const LEAD_MINUTES = CREDIT_SETTINGS_LEAD_MS / 60_000;
/** A rise of this much on a typical run is flagged. */
export const RISE_WARN_PERCENT = 20;
/** At or above this margin the rise warning names it, in case it is a typo. */
export const MARGIN_WARN_PERCENT = 50;

/** When new settings start: tomorrow 00:00 IST unless the admin picks otherwise. */
export function defaultCreditWhen(now: Date): When {
  return { mode: "date", date: addIstDays(todayIst(now), 1), time: "00:00" };
}

/** The start the server gives a When: never sooner than the lead. Null when the time can't be read. */
export function serverStart(w: When, now: Date): Date | null {
  const at = whenInstant(w, now);
  return at ? new Date(Math.max(at.getTime(), now.getTime() + CREDIT_SETTINGS_LEAD_MS)) : null;
}

/** Why the When can't be used: a time that can't be read or has passed, or a start another change already has. */
export function creditWhenProblem(w: When, now: Date, starts: readonly string[]): string | null {
  const problem = whenProblem(w, now);
  if (problem) return problem;
  const at = serverStart(w, now);
  if (at && starts.some((s) => Date.parse(s) === at.getTime())) return "A change already starts then. Pick another time, or cancel that change first.";
  return null;
}

/** The Now choice's words: it starts after the lead, and it reaches every agency at once. */
export const NOW_DETAIL = `Starts ${LEAD_MINUTES} minutes after you save. Every model's credits change with the next run; runs already going keep today's settings.`;
export const NOW_WARNING = "Now changes the credit cost of every model at once, with no notice to agencies. A date is safer.";
export const DATE_DETAIL = "Today's settings stay until then. Agencies get time to see it coming.";

export type ReviewNote = { tone: "warn" | "info"; text: string };

export type CreditReview = {
  /** "Margin 0% → 10%, Step 5 → 10". */
  summary: string;
  /** "from 25 Nov 2026, 00:00 IST, tomorrow." */
  startText: string;
  /** The settings in force just before the new ones start: what they are compared with. */
  before: Settings;
  rows: CreditRunRow[];
  warnings: ReviewNote[];
  agencies: AgencyChange[];
  /** "Credits agencies already hold will buy fewer runs." */
  holdNote: ReviewNote | null;
  canSave: boolean;
  confirm: string;
};

/** Everything the Review step shows for `draft` starting at `when`. `settings` are the rows that pass their check. */
export function buildCreditReview(a: {
  settings: readonly CreditSettings[];
  draft: Settings;
  when: When;
  now: Date;
  runs: readonly CreditRun[];
  agencyRuns: readonly AgencyModelRuns[];
  modelRuns: Readonly<Record<string, PricedRun>>;
}): CreditReview {
  const at = serverStart(a.when, a.now) ?? a.now;
  const t = at.getTime();
  const before = creditSettingsAt({ creditSettings: [...a.settings] }, new Date(t - 1));
  const same = sameSettings(before, a.draft);
  const rows = creditRunRows(a.runs, before, a.draft);
  const warnings: ReviewNote[] = [];

  if (same) warnings.push({ tone: "info", text: "These are the settings in force then. Nothing new to save." });
  const rises = rows.filter((r) => (r.percent ?? 0) >= RISE_WARN_PERCENT - 1e-9).length;
  if (rises) {
    const check = a.draft.marginPercent >= MARGIN_WARN_PERCENT ? `Check the margin: you entered ${a.draft.marginPercent}%.` : "Check that's what you meant.";
    warnings.push({ tone: "warn", text: `${rises} of ${rows.length} typical runs cost ${RISE_WARN_PERCENT}% or more extra. ${check}` });
  }
  const scheduled = [...a.settings].filter((s) => Date.parse(s.effectiveFrom) > a.now.getTime()).sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom));
  for (const s of scheduled) {
    const when = formatIstWhen(new Date(s.effectiveFrom));
    if (Date.parse(s.effectiveFrom) < t) warnings.push({ tone: "info", text: `The change scheduled for ${when} starts first, so the new settings are compared with it.` });
    else if (Date.parse(s.effectiveFrom) > t) warnings.push({ tone: "info", text: `The change scheduled for ${when} still follows and replaces these settings then.` });
  }

  const sum = (s: Settings) => a.runs.reduce((n, r) => n + creditsFor(r, s), 0);
  const p = percentChange(sum(before), sum(a.draft));
  const holdNote: ReviewNote | null =
    p === null || Math.abs(p) < 1e-9
      ? null
      : p > 0
        ? { tone: "warn", text: "Credits agencies already hold will buy fewer runs." }
        : { tone: "info", text: "Credits agencies already hold will buy more runs." };

  return {
    summary: settingsChangeWords(before, a.draft) || "No change",
    startText: a.when.mode === "now" ? `starting ${LEAD_MINUTES} minutes after you save.` : `from ${formatIstWhen(at)}, ${relativeIstDay(at, a.now)}.`,
    before,
    rows,
    warnings,
    agencies: agencyCreditImpact(a.agencyRuns, a.modelRuns, before, a.draft),
    holdNote,
    canSave: !same,
    confirm: a.when.mode === "now" ? "Apply new settings" : `Schedule for ${formatIstDate(at, false)}`,
  };
}

const moved = (requested: Date, effective: Date) => Math.abs(effective.getTime() - requested.getTime()) > 1000;

/** The toast after saving, with the start the server gave: "start in 2 minutes, at 12:02 IST" when it moved it. */
export function savedCreditMessage(a: { requested: Date; effective: Date; now: Date }): string {
  if (moved(a.requested, a.effective) && a.effective.getTime() > a.now.getTime()) {
    const minutes = Math.max(1, Math.round((a.effective.getTime() - a.now.getTime()) / 60_000));
    return `New credit settings start in ${minutes === 1 ? "1 minute" : `${minutes} minutes`}, at ${formatIstTime(a.effective)}.`;
  }
  return `New credit settings scheduled for ${formatIstWhen(a.effective)}.`;
}

/**
 * The toast's Undo: a change that starts outside the lead is cancelled. Inside the lead the server
 * refuses a cancel, and a change that hasn't started can't be undone, so there is no Undo.
 */
export function creditUndoPlan(effective: Date, now: Date): "cancel" | null {
  return effective.getTime() - now.getTime() > CREDIT_SETTINGS_LEAD_MS ? "cancel" : null;
}

/** The toast after the history's Undo: the earlier settings come back at the start the server gave. */
export function creditUndoneMessage(effective: Date): string {
  return `Undone. The earlier settings come back at ${formatIstTime(effective)}.`;
}
