import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/billing-catalog", () => ({ saveBillingSettingsAction: vi.fn(), saveOfferAction: vi.fn(), setOfferShownAction: vi.fn() }));

import { OffersSection } from "../offers-section";
import { SettingsBar } from "../settings-bar";
import type { BillingSettings, CatalogProduct } from "@/lib/billing/catalog";

const settings: BillingSettings = { id: "s", inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, effectiveFrom: "2026-11-21T00:00:00Z", note: null };
const price = (id: string, amount: number, active = true) => ({
  id, amount_minor: amount, list_amount_minor: null, interval_months: 1, credits: 100_000, credits_every_months: 1, valid_days: null, active, created_at: "2026-11-21T00:00:00Z",
});
const studio: CatalogProduct = { id: "p1", kind: "plan", name: "Studio", description: "For growing teams", sort: 0, active: true, prices: [price("new", 1_200_000), price("old", 1_010_000, false)] };

describe("Plans and prices", () => {
  it("sums up the settings in one line", () => {
    expect(renderToStaticMarkup(<SettingsBar settings={settings} />)).toContain("warn below 15%");
  });

  it("shows a plan as owners see it: price per month, GST and credits", () => {
    const html = renderToStaticMarkup(<OffersSection kind="plan" products={[studio]} counts={{ new: 2, old: 1 }} settings={settings} />);
    expect(html).toContain("₹12,000");
    expect(html).toContain("/ month");
    expect(html).toContain("+ GST · ₹14,160 in all");
    expect(html).toContain("1,00,000 credits every month");
    expect(html).toContain("For growing teams");
  });

  it("shows Admin the margin and every agency on the plan, old price included", () => {
    const html = renderToStaticMarkup(<OffersSection kind="plan" products={[studio]} counts={{ new: 2, old: 1 }} settings={settings} />);
    expect(html).toContain("20% margin");
    expect(html).toContain("3 agencies");
  });

  it("warns when the price earns less than the minimum", () => {
    const cheap = { ...studio, prices: [price("c", 1_010_000)] };
    const html = renderToStaticMarkup(<OffersSection kind="plan" products={[cheap]} counts={{}} settings={settings} />);
    expect(html).toMatch(/text-destructive[^"]*">.*1% margin/s);
  });

  it("dims a hidden plan and always offers Add", () => {
    const html = renderToStaticMarkup(<OffersSection kind="plan" products={[{ ...studio, active: false }]} counts={{}} settings={settings} />);
    expect(html).toContain("opacity-60");
    expect(html).toContain("Hidden");
    expect(html).toContain("Show");
    expect(html).toContain("Add a plan");
  });

  it("shows a top-up pack paid once", () => {
    const pack: CatalogProduct = { id: "t1", kind: "topup", name: "Small top-up", description: null, sort: 0, active: true, prices: [{ ...price("t", 312_500), interval_months: null, credits_every_months: null, credits: 25_000 }] };
    const html = renderToStaticMarkup(<OffersSection kind="topup" products={[pack]} counts={{}} settings={settings} />);
    expect(html).toContain("once");
    expect(html).toContain("25,000 credits until the plan month ends");
    expect(html).toContain("25% margin");
  });
});
