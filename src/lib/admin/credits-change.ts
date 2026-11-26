// The change-credit-settings flow on the Credits page: When (tomorrow 00:00 IST first, Now allowed
// with a warning), the Review (typical runs and agencies before and after, notes), and the toast's
// words and Undo after saving. Mirrors the server's D571 checks. Client-safe.
import { CREDIT_SETTINGS_LEAD_MINUTES, CREDIT_SETTINGS_LEAD_MS } from "@/lib/credits/settings-edit";
import { creditSettingsAt } from "@/lib/credits/units";
import type { CreditSettings } from "@/lib/ai-models/types";
import { replacedRow, serverStart, type When } from "./change-prices-when";
import type { AgencyChange } from "./change-prices";
import { addIstDays, formatIstDate, formatIstTime, formatIstWhen, relativeIstDay, todayIst } from "./ist";
import { percentChange } from "./percent-edit";
import {
  agencyCreditImpact,
  creditRunRows,
  creditsFor,
  sameSettings,
  settingsChangeWords,
  settingsWords,
  type AgencyModelRuns,
  type CreditRun,
  type CreditRunRow,
  type PricedRun,
  type Settings,
} from "./credits-page";

/** Every change starts this long after it is saved at the earliest; the server moves a sooner start. */
export const LEAD_MINUTES = CREDIT_SETTINGS_LEAD_MINUTES;
/** A rise of this much on a typical run is flagged. */
export const RISE_WARN_PERCENT = 20;
/** At or above this margin the rise warning names it, in case it is a typo. */
export const MARGIN_WARN_PERCENT = 50;

/** When new settings start: tomorrow 00:00 IST unless the admin picks otherwise. */
export function defaultCreditWhen(now: Date): When {
  return { mode: "date", date: addIstDays(todayIst(now), 1), time: "00:00" };
}

const startOf = (s: Pick<CreditSettings, "effectiveFrom">) => Date.parse(s.effectiveFrom);

/** The settings in force just before a start, with the replaced change left out (it is deleted by the save). */
export function settingsBefore(settings: readonly CreditSettings[], w: When, now: Date, replaced: CreditSettings | null): Settings {
  const at = serverStart(w, now, "credits") ?? now;
  const kept = settings.filter((s) => s.id !== replaced?.id);
  const s = creditSettingsAt({ creditSettings: kept }, new Date(at.getTime() - 1));
  return { marginPercent: s.marginPercent, roundStep: s.roundStep };
}

/** The Now choice's words: it starts after the lead, and it reaches every agency at once. */
export const NOW_DETAIL = `Starts ${LEAD_MINUTES} minutes after you save. Every model's credits change with the next run; runs already going keep the settings they started with.`;
export const NOW_WARNING = `Now changes the credit cost of every model all together, ${LEAD_MINUTES} minutes after you save, with no notice to agencies. A date is safer.`;
/** The date choice's words, naming the settings runs keep until the start. */
export function dateDetail(before: Settings): string {
  return `Until then, runs keep ${settingsWords(before)}. Agencies get time to see it coming.`;
}

export type ReviewNote = { tone: "warn" | "info"; text: string };

export type ReplacedChange = {
  title: string;
  /** Every setting the replaced change held, with what is saved instead ("Same" when it stays). */
  rows: { label: string; scheduled: string; saved: string }[];
};

export type CreditReview = {
  /** "Margin 0% → 10%, Step 5 → 10". */
  summary: string;
  /** "from 25 Nov 2026, 00:00 IST, tomorrow." */
  startText: string;
  /** What the new settings are compared with: the change they replace, or the settings in force just before them. */
  before: Settings;
  /** The scheduled change this save replaces, on the start's IST day. */
  replaced: ReplacedChange | null;
  /** The replaced row's id and start, for the save and its Undo. */
  replacedRow: CreditSettings | null;
  rows: CreditRunRow[];
  warnings: ReviewNote[];
  agencies: AgencyChange[];
  /** "Credits agencies already hold will buy fewer runs." */
  holdNote: ReviewNote | null;
  canSave: boolean;
  confirm: string;
};

const stepText = (n: number) => (n === 1 ? "1 credit" : `${n} credits`);

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
  const at = serverStart(a.when, a.now, "credits") ?? a.now;
  const t = at.getTime();
  const rep = replacedRow(a.settings, a.when, a.now);
  // Saving over a scheduled change is compared with that change, as in the prices flow.
  const before: Settings = rep ? { marginPercent: rep.marginPercent, roundStep: rep.roundStep } : settingsBefore(a.settings, a.when, a.now, null);
  const same = sameSettings(before, a.draft);
  const rows = creditRunRows(a.runs, before, a.draft);
  const warnings: ReviewNote[] = [];

  if (same) {
    warnings.push({ tone: "info", text: rep ? "These are the settings that change already holds. Nothing new to save." : "These are the settings in force then. Nothing new to save." });
  }
  const rises = rows.filter((r) => (r.percent ?? 0) >= RISE_WARN_PERCENT - 1e-9).length;
  if (rises) {
    const check = a.draft.marginPercent >= MARGIN_WARN_PERCENT ? `Check the margin: you entered ${a.draft.marginPercent}%.` : "Check that's what you meant.";
    warnings.push({ tone: "warn", text: `${rises} of ${rows.length} typical runs cost ${RISE_WARN_PERCENT}% or more extra. ${check}` });
  }
  const scheduled = [...a.settings].filter((s) => s.id !== rep?.id && startOf(s) > a.now.getTime()).sort((x, y) => startOf(x) - startOf(y));
  for (const s of scheduled) {
    const when = formatIstWhen(new Date(s.effectiveFrom));
    if (startOf(s) < t && !rep) warnings.push({ tone: "info", text: `The change scheduled for ${when} starts first, so the new settings are compared with it.` });
    else if (startOf(s) > t) warnings.push({ tone: "info", text: `The change scheduled for ${when} still follows and replaces these settings then.` });
  }

  const sum = (s: Settings) => a.runs.reduce((n, r) => n + creditsFor(r, s), 0);
  const p = percentChange(sum(before), sum(a.draft));
  const holdNote: ReviewNote | null =
    p === null || Math.abs(p) < 1e-9
      ? null
      : p > 0
        ? { tone: "warn", text: "Credits agencies already hold will buy fewer runs." }
        : { tone: "info", text: "Credits agencies already hold will buy more runs." };

  const replaced: ReplacedChange | null = rep
    ? {
        title: `This replaces the change scheduled for ${formatIstWhen(new Date(rep.effectiveFrom))}.`,
        rows: [
          { label: "Margin", scheduled: `${rep.marginPercent}%`, saved: rep.marginPercent === a.draft.marginPercent ? "Same" : `${a.draft.marginPercent}%` },
          { label: "Rounding step", scheduled: stepText(rep.roundStep), saved: rep.roundStep === a.draft.roundStep ? "Same" : stepText(a.draft.roundStep) },
        ],
      }
    : null;

  return {
    summary: settingsChangeWords(before, a.draft) || "No change",
    startText: a.when.mode === "now" ? `starting ${LEAD_MINUTES} minutes after you save.` : `from ${formatIstWhen(at)}, ${relativeIstDay(at, a.now)}.`,
    before,
    replaced,
    replacedRow: rep,
    rows,
    warnings,
    agencies: agencyCreditImpact(a.agencyRuns, a.modelRuns, before, a.draft),
    holdNote,
    canSave: !same,
    confirm: same
      ? "Nothing new to save"
      : rep
        ? `Replace the ${formatIstDate(new Date(rep.effectiveFrom), false)} change`
        : a.when.mode === "now"
          ? "Apply new settings"
          : `Schedule for ${formatIstDate(at, false)}`,
  };
}

const moved = (requested: Date, effective: Date) => Math.abs(effective.getTime() - requested.getTime()) > 1000;

/** The toast after saving, with the start the server gave: "start in 2 minutes, at 12:02 IST" when it moved it. */
export function savedCreditMessage(a: { requested: Date; effective: Date; now: Date; replaced: Date | null }): string {
  if (a.replaced) return `The ${formatIstDate(a.replaced, false)} change is replaced. The new settings start ${formatIstWhen(a.effective)}.`;
  if (moved(a.requested, a.effective) && a.effective.getTime() > a.now.getTime()) {
    const minutes = Math.max(1, Math.round((a.effective.getTime() - a.now.getTime()) / 60_000));
    return `New credit settings start in ${minutes === 1 ? "1 minute" : `${minutes} minutes`}, at ${formatIstTime(a.effective)}.`;
  }
  return `New credit settings scheduled for ${formatIstWhen(a.effective)}.`;
}

/**
 * The toast's Undo, outside the lead only (inside it the server refuses both a cancel and a replace,
 * and a change that hasn't started can't be undone): a new change is cancelled; a replace is undone
 * by replacing the new row with the change it replaced.
 */
export function creditUndoPlan(effective: Date, now: Date, replaced: boolean): "cancel" | "restore" | null {
  if (effective.getTime() - now.getTime() <= CREDIT_SETTINGS_LEAD_MS) return null;
  return replaced ? "restore" : "cancel";
}

/** The toast after a replace is undone: the change is back, at a later start if the server moved it. */
export function restoredMessage(requested: Date, effective: Date): string {
  if (moved(requested, effective)) return `Undone. The earlier change is back, starting ${formatIstWhen(effective)}.`;
  return `Undone. The ${formatIstDate(requested, false)} change is back.`;
}

/** The toast after the history's Undo: the earlier settings come back at the start the server gave. */
export function creditUndoneMessage(effective: Date): string {
  return `Undone. The earlier settings come back at ${formatIstTime(effective)}.`;
}
