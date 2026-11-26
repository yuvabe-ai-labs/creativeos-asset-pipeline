import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAYMENT_FILTERS,
  isDefaultPaymentFilters,
  likeText,
  paymentFiltersFromParams,
  paymentFiltersToParams,
  paymentRangeBounds,
} from "../admin-payments-filters";

describe("Admin › Payments filters", () => {
  it("reads what the browser sends and falls back to this month, every status, page 1", () => {
    expect(paymentFiltersFromParams(new URLSearchParams("range=last_month&status=created&q=%20Kite%20&page=3"))).toEqual({ range: "last_month", tab: "created", query: "Kite", page: 3 });
    expect(paymentFiltersFromParams(new URLSearchParams("range=year&status=lost&page=-2"))).toEqual(DEFAULT_PAYMENT_FILTERS);
  });

  it("round-trips through the query string, leaving out an empty search", () => {
    const f = { range: "all" as const, tab: "failed" as const, query: "Bloom", page: 2 };
    expect(paymentFiltersFromParams(new URLSearchParams(paymentFiltersToParams(f)))).toEqual(f);
    expect(paymentFiltersToParams(DEFAULT_PAYMENT_FILTERS)).not.toContain("q=");
  });

  it("knows the page's own first view, whatever spaces are typed", () => {
    expect(isDefaultPaymentFilters({ ...DEFAULT_PAYMENT_FILTERS, query: "  " })).toBe(true);
    expect(isDefaultPaymentFilters({ ...DEFAULT_PAYMENT_FILTERS, page: 2 })).toBe(false);
  });

  it("bounds a month in India time, and all time not at all", () => {
    expect(paymentRangeBounds("this_month", new Date("2026-11-26T06:00:00Z"))).toEqual({ from: "2026-10-31T18:30:00.000Z", to: "2026-11-30T18:30:00.000Z" });
    expect(paymentRangeBounds("all")).toEqual({ from: null, to: null });
  });

  it("escapes a search's wildcards", () => {
    expect(likeText(" 100%_a\\b ")).toBe("100\\%\\_a\\\\b");
  });
});
