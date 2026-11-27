// Pricing math for Admin's Plans and prices (spec 2026-11-21-plans-and-prices-design.md, D577).
// Credits are tied to dollars: 1,000 credits = $1 of AI cost. The rupee rate only suggests prices
// and checks margins; it never changes what a run costs in credits.

/** Plan intervals offered now. Quarterly (3), half-yearly (6) and yearly (12) join when piece 5
 *  supports them; the schema already does. */
export const PLAN_INTERVALS = [1] as const;

/** Prices are stored and shown before GST. */
export const GST_PCT = 18;

const CREDITS_PER_USD = 1000;

/** What `credits` cost us at `inrPerUsd`, in paise. */
export function costMinor(credits: number, inrPerUsd: number): number {
  return (credits / CREDITS_PER_USD) * inrPerUsd * 100;
}

type PriceShape = { credits: number; interval_months: number | null; credits_every_months: number | null };

/** Credits a price gives over its whole period: every drop for a plan, the pack for a top-up. */
export function periodCredits(p: PriceShape): number {
  if (!p.interval_months || !p.credits_every_months) return p.credits;
  return p.credits * (p.interval_months / p.credits_every_months);
}

/** The price's margin over our cost, as a whole percent (negative when it loses money). */
export function realMarginPct(p: PriceShape & { amount_minor: number }, inrPerUsd: number): number {
  const cost = costMinor(periodCredits(p), inrPerUsd);
  return Math.round((p.amount_minor / cost - 1) * 100);
}

/** The amount for `credits` at a margin, rounded up to a whole rupee, in paise. */
export function suggestAmountMinor(credits: number, inrPerUsd: number, marginPct: number): number {
  const paise = costMinor(credits, inrPerUsd) * (1 + marginPct / 100);
  return Math.ceil(Math.round(paise) / 100) * 100;
}

const INTERVAL_NAMES: Record<number, string> = { 1: "Monthly", 3: "Quarterly", 6: "Half-yearly", 12: "Yearly" };

export function intervalLabel(months: number): string {
  return INTERVAL_NAMES[months] ?? `Every ${months} months`;
}

/** How often a plan's credits arrive within its period. */
export function creditsCadenceLabel(intervalMonths: number, everyMonths: number): string {
  if (everyMonths === intervalMonths && intervalMonths > 1) return "all at once";
  if (everyMonths === 1) return "every month";
  return `every ${everyMonths} months`;
}

/** `₹1,08,000`: rupees in Indian grouping, no paise when whole. */
export function formatRupees(minor: number): string {
  const rupees = minor / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2 })}`;
}
