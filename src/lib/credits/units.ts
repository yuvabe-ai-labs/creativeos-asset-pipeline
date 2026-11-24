// See docs/superpowers/specs/2026-07-24-credit-system-design.md §2a.
//
// 1 credit = $0.001 USD. USD_TO_CREDITS is fixed (it changes only with plan prices); margin and
// rounding step come from the credit_settings rows (D548), applied by creditsFromUsd.
import type { AiCatalog, CreditSettings } from "@/lib/ai-models/types";

export const USD_TO_CREDITS = 1000;

/** Fallback only, used when no settings row is in force. */
export const DEFAULT_CREDIT_SETTINGS: CreditSettings = {
  id: "default",
  effectiveFrom: "1970-01-01T00:00:00.000Z",
  marginPercent: 0,
  roundStep: 5,
  note: null,
};

/**
 * The single conversion from a real or estimated USD cost to the final credit number,
 * used identically for the pre-generation estimate and the actual settlement charge.
 * Applies the settings row's margin, then rounds UP to its step, so a charge never falls
 * short of true cost.
 */
export function creditsFromUsd(
  usd: number,
  settings: Pick<CreditSettings, "marginPercent" | "roundStep">,
): number {
  // To 6 decimals first, so float noise (5 x 0.084 = 0.42000000000000004) never adds a step.
  const raw = Math.round(usd * USD_TO_CREDITS * (1 + settings.marginPercent / 100) * 1e6) / 1e6;
  return Math.ceil(raw / settings.roundStep) * settings.roundStep;
}

// Once per process: a missing row would otherwise log on every estimate a screen renders.
let loggedFallback = false;

/**
 * The settings row in force at `at`: the latest row whose effectiveFrom is not after it.
 * Falls back to DEFAULT_CREDIT_SETTINGS (logged once) when no row has started.
 */
export function creditSettingsAt(
  catalog: Pick<AiCatalog, "creditSettings">,
  at: Date,
): CreditSettings {
  const t = at.getTime();
  let best: CreditSettings | null = null;
  let bestT = -Infinity;
  for (const row of catalog.creditSettings) {
    const from = new Date(row.effectiveFrom).getTime();
    if (from <= t && from > bestT) {
      best = row;
      bestT = from;
    }
  }
  if (best) return best;
  if (!loggedFallback) {
    loggedFallback = true;
    console.error("[credits] no credit settings row in force; using defaults", at.toISOString());
  }
  return DEFAULT_CREDIT_SETTINGS;
}

// Shown wherever a 402 (CreditLimitError, src/lib/db/credit-transactions.ts) reaches the
// UI — every creation route's catch handler swaps in this message instead of the raw
// "Monthly credit limit reached" server string, so the user gets something actionable.
export const CREDIT_LIMIT_TOAST_MESSAGE =
  "Monthly credit limit reached. Contact your admin to increase it, or wait until next month.";
