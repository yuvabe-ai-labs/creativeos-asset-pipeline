import { usageRange } from "./usage-period";
import { pageParam } from "./usage-page-size";

// Admin › Payments' ledger filters (D592): when, which status, which agency, which page. Shared by
// the server read, its route and the browser, so all three read a filter the same way.

export const PAYMENT_RANGES = ["this_month", "last_month", "all"] as const;
export type PaymentRange = (typeof PAYMENT_RANGES)[number];
export const PAYMENT_RANGE_LABEL: Record<PaymentRange, string> = { this_month: "This month", last_month: "Last month", all: "All time" };

/** The tabs, in order. "Not finished" is a checkout that was started and never paid. */
export const PAYMENT_TABS = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
  { key: "created", label: "Not finished" },
] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number]["key"];
export type PaymentStatus = Exclude<PaymentTab, "all">;

export type PaymentFilters = { range: PaymentRange; tab: PaymentTab; query: string; page: number };

export const DEFAULT_PAYMENT_FILTERS: PaymentFilters = { range: "this_month", tab: "all", query: "", page: 1 };

const MAX_QUERY = 100;

const isRange = (v: unknown): v is PaymentRange => (PAYMENT_RANGES as readonly unknown[]).includes(v);
const isTab = (v: unknown): v is PaymentTab => PAYMENT_TABS.some((t) => t.key === v);

/** The page the server renders: this month, every status, no search, page 1. */
export function isDefaultPaymentFilters(f: PaymentFilters): boolean {
  return f.range === "this_month" && f.tab === "all" && f.query.trim() === "" && f.page === 1;
}

export function paymentFiltersFromParams(params: URLSearchParams): PaymentFilters {
  const range = params.get("range");
  const tab = params.get("status");
  return {
    range: isRange(range) ? range : DEFAULT_PAYMENT_FILTERS.range,
    tab: isTab(tab) ? tab : DEFAULT_PAYMENT_FILTERS.tab,
    query: (params.get("q") ?? "").trim().slice(0, MAX_QUERY),
    page: pageParam(params.get("page")),
  };
}

export function paymentFiltersToParams(f: PaymentFilters): string {
  const p = new URLSearchParams({ range: f.range, status: f.tab, page: String(f.page) });
  const q = f.query.trim();
  if (q) p.set("q", q);
  return p.toString();
}

/** The range's bounds by when a payment was started, India time; null for no bound. */
export function paymentRangeBounds(range: PaymentRange, now: Date = new Date()): { from: string | null; to: string | null } {
  if (range === "all") return { from: null, to: null };
  return usageRange(range, now);
}

/** A search for `ilike '%…%'`: \ % and _ match themselves. */
export function likeText(query: string): string {
  return query.trim().slice(0, MAX_QUERY).replace(/[\\%_]/g, (c) => `\\${c}`);
}
