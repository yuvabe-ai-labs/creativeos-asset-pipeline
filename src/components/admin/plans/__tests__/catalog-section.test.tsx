import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/billing-catalog", () => ({
  saveBillingSettingsAction: vi.fn(), saveProductAction: vi.fn(), addPriceAction: vi.fn(), setPriceActiveAction: vi.fn(),
}));

import { CatalogSection } from "../catalog-section";
import { SettingsCard } from "../settings-card";
import type { BillingSettings, CatalogProduct } from "@/lib/billing/catalog";

const settings: BillingSettings = { id: "s", inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, effectiveFrom: new Date().toISOString(), note: null };
const price = (id: string, amount: number, active = true) => ({
  id, amount_minor: amount, list_amount_minor: null, interval_months: 1, credits: 100_000, credits_every_months: 1, valid_days: null, active, created_at: "2026-11-21T00:00:00Z",
});
const studio: CatalogProduct = { id: "p1", kind: "plan", name: "Studio", description: "For growing teams", sort: 0, active: true, prices: [price("new", 1_200_000), price("old", 1_010_000, false)] };

describe("Plans and prices", () => {
  it("shows the settings in force", () => {
    const html = renderToStaticMarkup(<SettingsCard settings={settings} />);
    expect(html).toContain("₹100");
    expect(html).toContain("15%");
    expect(html).toContain("Prices are before 18% GST.");
  });

  it("shows each price with GST note, credits, agencies on it and its margin", () => {
    const html = renderToStaticMarkup(<CatalogSection kind="plan" products={[studio]} counts={{ new: 3 }} settings={settings} />);
    expect(html).toContain("Monthly · ₹12,000");
    expect(html).toContain("+ GST");
    expect(html).toContain("1,00,000 credits every month · 3 agencies on it");
    expect(html).toContain("Margin 20%");
  });

  it("warns on a price below the minimum margin, and marks hidden prices", () => {
    const html = renderToStaticMarkup(<CatalogSection kind="plan" products={[studio]} counts={{}} settings={settings} />);
    expect(html).toContain("Margin 1%");
    expect(html).toMatch(/text-destructive[^"]*">.*Margin 1%/s);
    expect(html).toContain("Hidden");
    expect(html).toContain("0 agencies on it");
  });

  it("says when there is nothing to buy yet", () => {
    expect(renderToStaticMarkup(<CatalogSection kind="plan" products={[]} counts={{}} settings={settings} />)).toContain("No plans yet.");
    const bare = { ...studio, prices: [] };
    expect(renderToStaticMarkup(<CatalogSection kind="plan" products={[bare]} counts={{}} settings={settings} />)).toContain("No price yet, so owners can&#x27;t buy it.");
  });

  it("shows top-up packs as one payment lasting until the plan month ends", () => {
    const pack: CatalogProduct = { id: "t1", kind: "topup", name: "25,000 credits", description: null, sort: 0, active: true, prices: [{ ...price("t", 312_500), interval_months: null, credits_every_months: null, credits: 25_000 }] };
    const html = renderToStaticMarkup(<CatalogSection kind="topup" products={[pack]} counts={{}} settings={settings} />);
    expect(html).toContain("One payment · ₹3,125");
    expect(html).toContain("25,000 credits, until the plan month ends");
    expect(html).toContain("Margin 25%");
  });
});
