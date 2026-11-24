// D548 — the checks every admin write to the credit settings runs. Pure and client-safe.
import type { CreditSettings } from "@/lib/ai-models/types";

export const NOTE_MAX = 500;
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
  const at = input.effectiveFrom.getTime();
  if (Number.isNaN(at) || at < now.getTime() - 60_000) return { ok: false, error: PAST_ERROR };
  if (existing.some((s) => new Date(s.effectiveFrom).getTime() === at)) return { ok: false, error: TAKEN_ERROR };
  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") return { ok: false, error: NOTE_ERROR };
    const text = input.note.trim();
    if (text.length > NOTE_MAX) return { ok: false, error: NOTE_ERROR };
    note = text === "" ? null : text;
  }
  return { ok: true, value: { effectiveFrom: input.effectiveFrom.toISOString(), marginPercent: margin, roundStep: step, note } };
}
