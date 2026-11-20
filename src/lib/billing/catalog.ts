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

export type BillingSettings = {
  id: string;
  inrPerUsd: number;
  planMarginPct: number;
  topupMarginPct: number;
  minMarginPct: number;
  effectiveFrom: string;
  note: string | null;
};
