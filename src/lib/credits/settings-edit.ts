// D548 — the checks every admin write to the credit settings runs. Pure and client-safe.
import { CATALOG_CHANGE_LEAD_MS } from "@/lib/ai-models/pricing";
import type { CreditSettings } from "@/lib/ai-models/types";

export const NOTE_MAX = 500;
// A change starts at least this long after it is saved, and can't be cancelled in its last stretch of
// it (the lead every dated catalog row shares; see CATALOG_CHANGE_LEAD_MS).
export const CREDIT_SETTINGS_LEAD_MS = CATALOG_CHANGE_LEAD_MS;
/** The lead in whole minutes, for the words screens and errors show. */
export const CREDIT_SETTINGS_LEAD_MINUTES = CREDIT_SETTINGS_LEAD_MS / 60_000;
const MARGIN_ERROR = "The margin must be between 0% and 200%.";
const STEP_ERROR = "Pick a rounding step of 1, 5 or 10.";
const PAST_ERROR = "A change can't start in the past.";
const TAKEN_ERROR = "There is already a change starting then.";
const NOTE_ERROR = `Keep the note under ${NOTE_MAX} characters.`;

export function checkNewCreditSettings(
  input: { effectiveFrom: Date; marginPercent: unknown; roundStep: unknown; note?: unknown },
  existing: Pick<CreditSettings, "effectiveFrom">[],
  now: Date,
):
  | { ok: true; value: { effectiveFrom: string; marginPercent: number; roundStep: 1 | 5 | 10; note: string | null } }
  | { ok: false; error: string } {
  const margin = input.marginPercent;
  // The column is numeric(5,2): more than two decimals would be rounded by the database.
  if (typeof margin !== "number" || !Number.isFinite(margin) || margin < 0 || margin > 200 || Math.abs(margin * 100 - Math.round(margin * 100)) > 1e-6) {
    return { ok: false, error: MARGIN_ERROR };
  }
  const step = input.roundStep;
  if (step !== 1 && step !== 5 && step !== 10) return { ok: false, error: STEP_ERROR };
  const requested = input.effectiveFrom.getTime();
  if (Number.isNaN(requested) || requested < now.getTime() - 60_000) return { ok: false, error: PAST_ERROR };
  const at = Math.max(requested, now.getTime() + CREDIT_SETTINGS_LEAD_MS);
  if (existing.some((s) => new Date(s.effectiveFrom).getTime() === at)) return { ok: false, error: TAKEN_ERROR };
  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") return { ok: false, error: NOTE_ERROR };
    const text = input.note.trim();
    if (text.length > NOTE_MAX) return { ok: false, error: NOTE_ERROR };
    note = text === "" ? null : text;
  }
  return { ok: true, value: { effectiveFrom: new Date(at).toISOString(), marginPercent: margin, roundStep: step, note } };
}
