// See docs/superpowers/specs/2026-07-24-credit-system-design.md §2a.
//
// 1 credit = $0.001 USD. USD_TO_CREDITS, MARGIN_PERCENT, CREDIT_ROUND_STEP, and
// CREDIT_ROUND_DIRECTION are all plain, hand-tunable constants — bump any of them later
// (e.g. for margin) without touching the conversion logic itself.
export const USD_TO_CREDITS = 1000;
export const MARGIN_PERCENT = 0;
export const CREDIT_ROUND_STEP = 5;
export const CREDIT_ROUND_DIRECTION: "up" | "down" | "nearest" = "up";

/**
 * The single conversion from a real or estimated USD cost to the final credit number —
 * used identically for the pre-generation estimate shown to the user and the actual
 * settlement charge, so what's shown always matches what's deducted. Applies margin, then
 * rounds in CREDIT_ROUND_DIRECTION to the nearest CREDIT_ROUND_STEP. Rounding up (the
 * starting direction) guarantees the charge never falls short of true cost.
 */
export function usdToFinalCredits(costUsd: number): number {
  const raw = costUsd * USD_TO_CREDITS * (1 + MARGIN_PERCENT / 100);
  switch (CREDIT_ROUND_DIRECTION) {
    case "up":
      return Math.ceil(raw / CREDIT_ROUND_STEP) * CREDIT_ROUND_STEP;
    case "down":
      return Math.floor(raw / CREDIT_ROUND_STEP) * CREDIT_ROUND_STEP;
    case "nearest":
      return Math.round(raw / CREDIT_ROUND_STEP) * CREDIT_ROUND_STEP;
  }
}

// Shown wherever a 402 (CreditLimitError, src/lib/db/credit-transactions.ts) reaches the
// UI — every creation route's catch handler swaps in this message instead of the raw
// "Monthly credit limit reached" server string, so the user gets something actionable.
export const CREDIT_LIMIT_TOAST_MESSAGE =
  "Monthly credit limit reached. Contact your admin to increase it, or wait until next month.";
