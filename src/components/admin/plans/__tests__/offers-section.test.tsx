import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/billing-catalog", () => ({ saveBillingSettingsAction: vi.fn(), saveOfferAction: vi.fn(), setOfferShownAction: vi.fn() }));

import { OffersSection } from "../offers-section";
import { SettingsLine } from "../settings-line";
import { offerView } from "@/lib/admin/plans-page";
import type { BillingSettings, CatalogProduct, PriceHealth } from "@/lib/billing/catalog";

const settings: BillingSettings = { id: "s", inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, effectiveFrom: "2026-11-21T00:00:00Z", note: null };
const price = (id: string, amount: number, active = true, created = "2026-11-21T00:00:00Z") => ({
  id, amount_minor: amount, list_amount_minor: null, interval_months: 1, credits: 100_000, credits_every_months: 1, valid_days: null, active, created_at: created,
});
const studio: CatalogProduct = { id: "p1", kind: "plan", name: "Studio", description: "For growing teams", sort: 0, active: true, prices: [price("new", 1_200_000), price("old", 1_010_000, false, "2026-10-01T00:00:00Z")] };
const h = (over: Partial<PriceHealth>): PriceHealth => ({ agencies: 0, active: 0, ending: 0, due: 0, monthlyMinor: 0, paidCount: 0, paidMinor: 0, ...over });
const health = { new: h({ agencies: 2, active: 1, ending: 1, monthlyMinor: 1_200_000 }), old: h({ agencies: 1, active: 1, monthlyMinor: 1_010_000 }) };

const plans = (products: CatalogProduct[], hl: Record<string, PriceHealth> = health, agency = false) =>
  renderToStaticMarkup(<OffersSection kind="plan" views={products.map((p) => offerView(p, hl, settings))} health={hl} settings={settings} agency={agency} />);

describe("Plans and prices, cards with health", () => {
  it("says the settings in one sentence, with Change", () => {
    const html = renderToStaticMarkup(<SettingsLine settings={settings} views={[]} />);
    expect(html).toContain("₹100 to a dollar");
    expect(html).toContain("a warning below");
    expect(html).toContain("Change");
  });

  it("keeps the owner's face on top: price per month, GST and credits", () => {
    const html = plans([studio]);
    expect(html).toContain("₹12,000");
    expect(html).toContain("/ month");
    expect(html).toContain("+ GST · ₹14,160 in all");
    expect(html).toContain("1,00,000 credits every month");
    expect(html).toContain("For growing teams");
  });

  it("shows Admin the margin, our cost, who is on it and what it brings each month", () => {
    const html = plans([studio]);
    expect(html).toContain("20% margin");
    expect(html).toContain("Costs us ₹10,000");
    expect(html).toContain("3 agencies");
    expect(html).toContain(", 1 ending");
    expect(html).toContain("₹22,100");
    expect(html).toContain(" a month");
  });

  it("says when the agencies on an older price move to today's price, and offers the price history (D593)", () => {
    const moves = [{ priceId: "old", nextPriceId: "new", state: "scheduled" as const, refused: null, agencies: 1, firstRenewal: "2026-12-03T06:00:00Z", lastRenewal: "2026-12-03T06:00:00Z", firstEnd: null, lastEnd: null, orgs: [] }];
    const html = renderToStaticMarkup(<OffersSection kind="plan" views={[offerView(studio, health, settings, moves)]} health={health} settings={settings} agency={false} />);
    expect(html).toContain("1 agency moves from ₹10,100 + GST to the new price at its next renewal, on 3 Dec 2026.");
    expect(html).not.toContain("still pays");
    expect(html).toContain("2 prices");
  });

  it("sums the section: agencies on a plan (ending left out) and the month before GST", () => {
    expect(plans([studio])).toContain("2 agencies on a plan · ₹22,100 a month before GST");
  });

  it("warns when the price earns less than the minimum", () => {
    const cheap = { ...studio, prices: [price("c", 1_010_000)] };
    expect(plans([cheap], {})).toMatch(/text-warning-text[^"]*">.*1% margin/s);
  });

  it("puts a hidden plan last, softer, with Show; Add is always there", () => {
    const html = plans([{ ...studio, id: "p0", name: "Pilot", active: false }, studio], {});
    expect(html.indexOf("Studio")).toBeLessThan(html.indexOf("Pilot"));
    expect(html).toContain("bg-muted/40");
    expect(html).toContain("Hidden");
    expect(html).toContain("Show");
    expect(html).toContain("Add a plan");
  });

  it("shows a top-up pack paid once, with what it brought in this month", () => {
    const pack: CatalogProduct = { id: "t1", kind: "topup", name: "Small top-up", description: null, sort: 0, active: true, prices: [{ ...price("t", 312_500), interval_months: null, credits_every_months: null, credits: 25_000 }] };
    const hl = { t: h({ paidCount: 2, paidMinor: 737_500 }) };
    const html = renderToStaticMarkup(<OffersSection kind="topup" views={[offerView(pack, hl, settings)]} health={hl} settings={settings} />);
    expect(html).toContain("once");
    expect(html).toContain("25,000 credits until the plan month ends");
    expect(html).toContain("25% margin");
    expect(html).toContain("Bought 2 times this month");
    expect(html).toContain("₹7,375");
    expect(html).toContain("2 top-ups this month · ₹7,375 with GST");
  });

  it("What agencies see: shown offers only, the owner's step, no costs or counts", () => {
    const html = plans([studio, { ...studio, id: "p0", name: "Pilot", active: false }], health, true);
    expect(html).toContain("Pick Studio");
    expect(html).not.toContain("Pilot");
    expect(html).not.toContain("margin");
    expect(html).not.toContain("agencies");
    expect(html).not.toContain("Add a plan");
  });
});
