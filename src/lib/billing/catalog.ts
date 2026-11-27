// The catalog's shapes, shared by the server reads and the Admin screen (no server code here).

export type CatalogPrice = {
  id: string;
  amount_minor: number;
  list_amount_minor: number | null;
  interval_months: number | null;
  credits: number;
  credits_every_months: number | null;
  valid_days: number | null;
  active: boolean;
  created_at: string;
};

export type CatalogProduct = {
  id: string;
  kind: "plan" | "topup";
  name: string;
  description: string | null;
  sort: number;
  active: boolean;
  prices: CatalogPrice[];
};

/** One price's running plans and money (admin_offer_health, migration 0102). */
export type PriceHealth = {
  /** Active, ending (cancelled) or payment due. */
  agencies: number;
  active: number;
  ending: number;
  due: number;
  /** What the active plans pay each month, before GST. */
  monthlyMinor: number;
  /** Payments for the price this month, and their sum with GST. */
  paidCount: number;
  paidMinor: number;
};

export type BillingSettings = {
  id: string;
  inrPerUsd: number;
  planMarginPct: number;
  topupMarginPct: number;
  minMarginPct: number;
  effectiveFrom: string;
  note: string | null;
};
