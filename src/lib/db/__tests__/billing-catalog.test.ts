import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: m.rpc, from: m.from }) }));

import { getCatalog, getBillingSettings, getSubscriberCounts, saveOffer, saveProduct, saveBillingSettings } from "../billing-catalog";

beforeEach(() => { m.rpc.mockReset(); m.from.mockReset(); });

function builder(result: unknown) {
  const calls: unknown[][] = [];
  const b: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "lte", "order", "limit"]) b[name] = (...a: unknown[]) => { calls.push([name, ...a]); return b; };
  b.maybeSingle = () => { calls.push(["maybeSingle"]); return b; };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return { b, calls };
}

describe("catalog reads", () => {
  it("loads standard products with their prices in one query, newest price first", async () => {
    const q = builder([
      { id: "p1", kind: "plan", name: "Studio", description: null, sort: 0, active: true, billing_prices: [
        { id: "old", amount_minor: "1010000", list_amount_minor: null, interval_months: 1, credits: "100000", credits_every_months: 1, valid_days: null, active: false, created_at: "2026-11-01T00:00:00Z" },
        { id: "new", amount_minor: 1200000, list_amount_minor: null, interval_months: 1, credits: 100000, credits_every_months: 1, valid_days: null, active: true, created_at: "2026-11-21T00:00:00Z" },
      ] },
    ]);
    m.from.mockReturnValue(q.b);
    const [studio] = await getCatalog();
    expect(studio.prices.map((p) => p.id)).toEqual(["new", "old"]);
    expect(studio.prices[1]).toMatchObject({ amount_minor: 1_010_000, credits: 100_000 });
    expect(m.from).toHaveBeenCalledTimes(1);
    expect(q.calls).toContainEqual(["is", "org_id", null]);
  });

  it("reads the settings in force", async () => {
    const q = builder({ id: "s", inr_per_usd: "100", plan_margin_pct: "20", topup_margin_pct: "25", min_margin_pct: "15", effective_from: "2026-11-21T00:00:00Z", note: "n" });
    m.from.mockReturnValue(q.b);
    await expect(getBillingSettings()).resolves.toEqual({ id: "s", inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, effectiveFrom: "2026-11-21T00:00:00Z", note: "n" });
    expect(q.calls).toContainEqual(["order", "effective_from", { ascending: false }]);
    expect(q.calls).toContainEqual(["limit", 1]);
  });

  it("maps subscriber counts by price", async () => {
    m.rpc.mockResolvedValue({ data: [{ price_id: "a", subscribers: 3 }], error: null });
    await expect(getSubscriberCounts()).resolves.toEqual({ a: 3 });
    expect(m.rpc).toHaveBeenCalledWith("billing_price_subscriber_counts");
  });
});

describe("catalog writes", () => {
  it("saves a plan and its price in one call, and reports moved subscriptions", async () => {
    m.rpc.mockResolvedValue({ data: [{ product_id: "p1", price_changed: true, moved_count: 2 }], error: null });
    await expect(saveOffer({ productId: "p1", kind: "plan", name: "Studio", description: null, active: true, amountMinor: 1_200_000, credits: 100_000, intervalMonths: 1, reason: "Up" }, "admin"))
      .resolves.toEqual({ productId: "p1", priceChanged: true, moved: 2 });
    expect(m.rpc).toHaveBeenCalledWith("admin_save_offer", {
      p_product_id: "p1", p_kind: "plan", p_name: "Studio", p_description: null, p_active: true,
      p_amount_minor: 1_200_000, p_credits: 100_000, p_interval_months: 1, p_actor: "admin", p_reason: "Up",
    });
  });

  it("passes the other writes through and throws database errors", async () => {
    m.rpc.mockResolvedValue({ data: "p1", error: null });
    await expect(saveProduct({ id: "p1", kind: "plan", name: "Studio", description: null, active: false }, "admin")).resolves.toBe("p1");
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(saveBillingSettings({ inrPerUsd: 100, planMarginPct: 20, topupMarginPct: 25, minMarginPct: 15, note: "n" }, "admin")).rejects.toThrow("down");
  });
});
