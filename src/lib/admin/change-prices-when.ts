// When a change starts, shared by the change-prices and change-credit-settings flows: Now, or an IST
// date and typed IST time; the start the server will give it; which scheduled change a start
// replaces; and, for prices, which row the new prices are compared with. Client-safe.
import { CATALOG_CHANGE_LEAD_MS } from "@/lib/ai-models/pricing";
import type { AiModelPrice } from "@/lib/ai-models/types";
import { istDate, istInstant, parseIstTime } from "./ist";

/** When the new prices start: now, or an IST date ("YYYY-MM-DD") and a typed IST time. */
export type When = { mode: "now" | "date"; date: string; time: string };

/**
 * How the server sets a start. Both move a start inside the lead out to it; a price that starts now
 * stays now (a run records the price row it used), while credit settings move Now out too.
 */
export type StartRule = "prices" | "credits";

type DatedRow = { id: string; effectiveFrom: string };

/** The instant a When names; null when the date or time can't be read. */
export function whenInstant(w: When, now: Date): Date | null {
  if (w.mode === "now") return now;
  const t = parseIstTime(w.time);
  return t ? istInstant(w.date, t) : null;
}

/** Why the When can't be used yet, or null. */
export function whenProblem(w: When, now: Date): string | null {
  if (w.mode === "now") return null;
  const at = whenInstant(w, now);
  if (!at) return "Type a time like 8, 8:00, 8 pm or 20:00.";
  return at.getTime() <= now.getTime() ? "That moment has passed. Pick a later time or choose Now." : null;
}

/** The start the server gives a When, by its rule. Null when the time can't be read. */
export function serverStart(w: When, now: Date, rule: StartRule): Date | null {
  const at = whenInstant(w, now);
  if (!at) return null;
  if (rule === "prices" && at.getTime() <= now.getTime()) return at;
  return new Date(Math.max(at.getTime(), now.getTime() + CATALOG_CHANGE_LEAD_MS));
}

/**
 * Why the When can't be used: a time that can't be read or has passed, or a start the server would
 * give that another change already has (not `replacedId`, the change the save takes the place of).
 * `rows` are every row's id and start, rows that fail their check too: they still hold their start.
 */
export function changeWhenProblem(w: When, now: Date, rule: StartRule, rows: readonly DatedRow[], replacedId: string | null): string | null {
  const problem = whenProblem(w, now);
  if (problem) return problem;
  const at = serverStart(w, now, rule);
  if (at && rows.some((r) => r.id !== replacedId && Date.parse(r.effectiveFrom) === at.getTime())) {
    return "A change already starts then. Pick another time, or cancel that change first.";
  }
  return null;
}

/**
 * The start a save sends, checked again at the moment of saving: a date that has passed while the
 * review was open is refused here, never sent backdated. A Now start is sent as `now: true` and
 * takes the server's time.
 */
export function startToSave(w: When, now: Date): { at: Date } | { problem: string } {
  const problem = whenProblem(w, now);
  const at = whenInstant(w, now);
  return problem || !at ? { problem: problem ?? "Type a time like 8, 8:00, 8 pm or 20:00." } : { at };
}

const startOf = (p: Pick<DatedRow, "effectiveFrom">) => Date.parse(p.effectiveFrom);
/** Rows, earliest start first. */
export const pricesByStart = <T extends Pick<DatedRow, "effectiveFrom">>(rows: readonly T[]) => [...rows].sort((a, b) => startOf(a) - startOf(b));

/**
 * The scheduled change a save would replace: one on the IST day of a date start. Only a change the
 * server would still replace counts, one more than the lead away; a change inside it is never offered.
 */
export function replacedRow<T extends DatedRow>(rows: readonly T[], w: When, now: Date): T | null {
  if (w.mode !== "date") return null;
  const at = whenInstant(w, now);
  if (!at) return null;
  const day = istDate(at);
  return pricesByStart(rows).find((p) => startOf(p) > now.getTime() + CATALOG_CHANGE_LEAD_MS && istDate(new Date(p.effectiveFrom)) === day) ?? null;
}

/** What the new prices are compared with: the change they replace, or what would be live at their start. */
export function beforePrice(prices: readonly AiModelPrice[], w: When, now: Date): AiModelPrice | null {
  const rep = replacedRow(prices, w, now);
  if (rep) return rep;
  const at = (serverStart(w, now, "prices") ?? now).getTime();
  return pricesByStart(prices).filter((p) => startOf(p) <= at).at(-1) ?? null;
}
