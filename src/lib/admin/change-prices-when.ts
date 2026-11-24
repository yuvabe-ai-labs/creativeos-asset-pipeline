// When new prices start, in the change-prices flow: Now, or an IST date and typed IST time; which
// scheduled change a start replaces, and which row the new prices are compared with. Client-safe.
import type { AiModelPrice } from "@/lib/ai-models/types";
import { istDate, istInstant, parseIstTime } from "./ist";

/** When the new prices start: now, or an IST date ("YYYY-MM-DD") and a typed IST time. */
export type When = { mode: "now" | "date"; date: string; time: string };

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

/**
 * The start a save sends, checked again at the moment of saving: a date that has passed while the
 * review was open is refused here, never sent backdated (the server lets only a "Now" start run a
 * little behind its clock).
 */
export function startToSave(w: When, now: Date): { at: Date } | { problem: string } {
  const problem = whenProblem(w, now);
  const at = whenInstant(w, now);
  return problem || !at ? { problem: problem ?? "Type a time like 8, 8:00, 8 pm or 20:00." } : { at };
}

const startOf = (p: Pick<AiModelPrice, "effectiveFrom">) => Date.parse(p.effectiveFrom);
/** Price rows, earliest start first. */
export const pricesByStart = (prices: readonly AiModelPrice[]) => [...prices].sort((a, b) => startOf(a) - startOf(b));

/** The scheduled change a save would replace: one of this model's that hasn't started, on the same IST day. */
export function replacedRow(prices: readonly AiModelPrice[], w: When, now: Date): AiModelPrice | null {
  if (w.mode !== "date") return null;
  const at = whenInstant(w, now);
  if (!at) return null;
  const day = istDate(at);
  return pricesByStart(prices).find((p) => startOf(p) > now.getTime() && istDate(new Date(p.effectiveFrom)) === day) ?? null;
}

/** What the new prices are compared with: the change they replace, or what would be live at their start. */
export function beforePrice(prices: readonly AiModelPrice[], w: When, now: Date): AiModelPrice | null {
  const rep = replacedRow(prices, w, now);
  if (rep) return rep;
  const at = (whenInstant(w, now) ?? now).getTime();
  return pricesByStart(prices).filter((p) => startOf(p) <= at).at(-1) ?? null;
}
