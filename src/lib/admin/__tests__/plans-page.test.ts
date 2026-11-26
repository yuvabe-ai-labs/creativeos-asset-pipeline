import { describe, it, expect } from "vitest";
import { lowMarginItems, moveRefusedItems, offerView, olderPriceLines } from "../plans-page";
import type { PriceMove } from "@/lib/billing/plan-move-copy";
import type { BillingSettings, CatalogProduct, PriceHealth } from "@/lib/billing/catalog";

const settings: BillingSettings = { id: "s", inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, effectiveFrom: "2026-11-21T00:00:00Z", note: null };
const price = (id: string, amount: number, active = true) => ({
  id, amount_minor: amount, list_amount_minor: null, interval_months: 1, credits: 100_000, credits_every_months: 1, valid_days: null, active, created_at: "2026-11-21T00:00:00Z",
});
const h = (over: Partial<PriceHealth>): PriceHealth => ({ agencies: 0, active: 0, ending: 0, due: 0, monthlyMinor: 0, paidCount: 0, paidMinor: 0, ...over });
const growth: CatalogProduct = { id: "g", kind: "plan", name: "Growth", description: null, sort: 0, active: true, prices: [price("now", 1_100_000), price("a", 1_050_000, false), price("b", 1_000_000, false)] };

describe("offer health", () => {
  it("adds every price's agencies and money, and lists the older prices still paid", () => {
    const v = offerView(growth, { now: h({ agencies: 1, due: 1 }), a: h({ agencies: 2, active: 2, monthlyMinor: 2_100_000 }), b: h({}) }, settings);
    expect(v).toMatchObject({ agencies: 3, due: 1, monthlyMinor: 2_100_000, margin: 10, low: true, costMinor: 1_000_000 });
    expect(v.older).toMatchObject([{ amountMinor: 1_050_000, agencies: 2, moving: 0, waiting: 0, refused: [] }]);
    expect(olderPriceLines(v)).toEqual(["2 agencies on ₹10,500 + GST are ending or changing to another plan."]);
  });

  it("has no older-price line when everyone is on today's price", () => {
    expect(olderPriceLines(offerView(growth, { now: h({ agencies: 4 }) }, settings))).toEqual([]);
  });

  it("says who moves to today's price and when, who isn't set up yet and who can't move (D593)", () => {
    const move = (over: Partial<PriceMove>): PriceMove => ({ priceId: "a", nextPriceId: "now", state: "scheduled", refused: null, agencies: 1, firstRenewal: null, lastRenewal: null, orgs: [], ...over });
    const moves = [
      move({ agencies: 3, firstRenewal: "2026-12-03T06:00:00Z", lastRenewal: "2026-12-28T06:00:00Z" }),
      move({ state: "waiting", agencies: 1 }),
      move({ state: "refused", refused: "emandate", agencies: 2, orgs: [{ id: "o1", name: "Acme" }, { id: "o2", name: "Bolt" }] }),
      // A move to another plan the owner chose is not this offer's.
      move({ nextPriceId: "elsewhere", agencies: 5 }),
    ];
    const v = offerView(growth, { now: h({ agencies: 1 }), a: h({ agencies: 7 }) }, settings, moves);
    expect(olderPriceLines(v)).toEqual([
      "3 agencies move from ₹10,500 + GST to the new price at their next renewal, between 3 Dec 2026 and 28 Dec 2026. " +
        "1 agency on ₹10,500 + GST isn't set up to move yet. It's tried again each night. " +
        "2 agencies pay by bank mandate, so they stay on ₹10,500 + GST until they change plan. " +
        "1 agency on ₹10,500 + GST is ending or changing to another plan.",
    ]);
    const items = moveRefusedItems([v]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Growth", text: "2 agencies pay by bank mandate, so they stay on ₹10,500 + GST", detail: "Acme, Bolt.", action: "See the plan", href: "#offer-g", tone: "warn" });
    const one = moveRefusedItems([offerView(growth, { a: h({ agencies: 1 }) }, settings, [move({ state: "refused", refused: "upi", orgs: [{ id: "o1", name: "Acme" }] })])]);
    expect(one[0]).toMatchObject({ text: "1 agency pays by UPI, so it stays on ₹10,500 + GST", action: "Open the agency", href: "/admin/orgs/o1" });
  });

  it("knows no margin without settings, and never flags it", () => {
    expect(offerView(growth, {}, null)).toMatchObject({ margin: null, low: false, costMinor: null });
  });

  it("lists shown offers under the minimum for Needs a look, worded to read on from the name", () => {
    const views = [offerView(growth, { now: h({ agencies: 1 }) }, settings), offerView({ ...growth, id: "h", name: "Hidden", active: false }, {}, settings)];
    const items = lowMarginItems(views, settings);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Growth", text: "earns 10% at ₹100 a dollar, below 15%", detail: "1 agency is on it.", action: "Change the price", tone: "warn" });
  });
});
