import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  getOrgById: vi.fn(), getLive: vi.fn(), getPrice: vi.fn(), insert: vi.fn(), savePlan: vi.fn(), update: vi.fn(),
  createPlan: vi.fn(), createSubscription: vi.fn(), cancel: vi.fn(), change: vi.fn(),
}));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: m.getOrgById }));
vi.mock("@/lib/db/billing-subscriptions", () => ({
  getLiveSubscription: m.getLive, getPurchasablePrice: m.getPrice, insertSubscription: m.insert, savePriceRazorpayPlan: m.savePlan, updateSubscription: m.update,
}));
vi.mock("../razorpay", () => ({
  createPlan: m.createPlan, createSubscription: m.createSubscription, cancelSubscription: m.cancel, changeSubscriptionPlan: m.change, razorpayKeyId: () => "rzp_test_id",
}));

import { startSubscription, cancelPlan, changePlan } from "../subscriptions";

const price = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "price_1", amountMinor: 1_200_000, credits: 100_000, intervalMonths: 1, active: true, razorpayPlanId: null,
  product: { id: "prod_1", kind: "plan", name: "Studio", active: true, orgId: null }, ...over,
});
const live = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "row_1", status: "active", priceId: "price_0", nextPriceId: null, planName: "Starter", amountMinor: 1, credits: 1, currentPeriodEnd: "2026-12-21T00:00:00Z", razorpaySubscriptionId: "sub_old", ...over,
});

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.getOrgById.mockResolvedValue({ id: "org", billing_mode: "plans" });
  m.getLive.mockResolvedValue(null);
  m.getPrice.mockResolvedValue(price());
  m.createPlan.mockResolvedValue({ id: "plan_new" });
  m.savePlan.mockImplementation(async (_id: string, planId: string) => planId);
  m.createSubscription.mockResolvedValue({ id: "sub_new", status: "created", plan_id: "plan_new" });
  m.cancel.mockResolvedValue({});
  m.change.mockResolvedValue({});
});

describe("startSubscription", () => {
  it("makes the Razorpay plan with GST once, subscribes, and saves our row as created", async () => {
    await expect(startSubscription("org", "price_1")).resolves.toEqual({ ok: true, value: { subscriptionId: "sub_new", keyId: "rzp_test_id" } });
    expect(m.createPlan).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 1_416_000, name: "Studio" }));
    expect(m.createSubscription).toHaveBeenCalledWith({ planId: "plan_new", totalCount: 120, notes: { org_id: "org", price_id: "price_1" } });
    expect(m.insert).toHaveBeenCalledWith({ orgId: "org", priceId: "price_1", razorpaySubscriptionId: "sub_new" });
  });

  it("reuses the Razorpay plan a price already has", async () => {
    m.getPrice.mockResolvedValue(price({ razorpayPlanId: "plan_saved" }));
    await startSubscription("org", "price_1");
    expect(m.createPlan).not.toHaveBeenCalled();
    expect(m.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ planId: "plan_saved" }));
  });

  it("refuses a managed agency", async () => {
    m.getOrgById.mockResolvedValue({ id: "org", billing_mode: "managed" });
    await expect(startSubscription("org", "price_1")).resolves.toMatchObject({ ok: false, status: 409 });
    expect(m.createSubscription).not.toHaveBeenCalled();
  });

  it.each([
    ["a top-up", price({ product: { id: "p", kind: "topup", name: "T", active: true, orgId: null }, intervalMonths: null })],
    ["a hidden price", price({ active: false })],
    ["a hidden plan", price({ product: { id: "p", kind: "plan", name: "S", active: false, orgId: null } })],
    ["another agency's custom plan", price({ product: { id: "p", kind: "plan", name: "S", active: true, orgId: "other" } })],
    ["a yearly price (not offered yet)", price({ intervalMonths: 12 })],
    ["a missing price", null],
  ])("refuses %s", async (_label, p) => {
    m.getPrice.mockResolvedValue(p);
    await expect(startSubscription("org", "price_1")).resolves.toEqual({ ok: false, status: 400, error: "That plan isn't available." });
  });

  it("refuses when the agency already has a plan", async () => {
    m.getLive.mockResolvedValue(live());
    await expect(startSubscription("org", "price_1")).resolves.toEqual({ ok: false, status: 409, error: "You already have a plan. Change it from billing." });
  });

  it("drops an attempt closed before paying, then starts again", async () => {
    m.getLive.mockResolvedValue(live({ status: "created", razorpaySubscriptionId: "sub_stale" }));
    await expect(startSubscription("org", "price_1")).resolves.toMatchObject({ ok: true });
    expect(m.cancel).toHaveBeenCalledWith("sub_stale", false);
    expect(m.update).toHaveBeenCalledWith("row_1", { status: "ended" });
    expect(m.update.mock.invocationCallOrder[0]).toBeLessThan(m.insert.mock.invocationCallOrder[0]);
  });
});

describe("cancelPlan and changePlan", () => {
  it("cancels at the cycle end and keeps the plan until then", async () => {
    m.getLive.mockResolvedValue(live());
    await expect(cancelPlan("org")).resolves.toEqual({ ok: true, value: { endsAt: "2026-12-21T00:00:00Z" } });
    expect(m.cancel).toHaveBeenCalledWith("sub_old", true);
    expect(m.update).toHaveBeenCalledWith("row_1", { status: "cancelling", cancelAtPeriodEnd: true });
  });

  it("has nothing to cancel without a paid plan", async () => {
    await expect(cancelPlan("org")).resolves.toMatchObject({ ok: false, status: 404 });
    m.getLive.mockResolvedValue(live({ status: "created" }));
    await expect(cancelPlan("org")).resolves.toMatchObject({ ok: false, status: 404 });
  });

  it("changes the plan from the next payment", async () => {
    m.getLive.mockResolvedValue(live());
    await expect(changePlan("org", "price_1")).resolves.toEqual({ ok: true, value: { from: "2026-12-21T00:00:00Z" } });
    expect(m.change).toHaveBeenCalledWith("sub_old", "plan_new");
    expect(m.update).toHaveBeenCalledWith("row_1", { nextPriceId: "price_1" });
  });

  it("refuses to change a cancelled plan or to the same price", async () => {
    m.getLive.mockResolvedValue(live({ status: "cancelling" }));
    await expect(changePlan("org", "price_1")).resolves.toMatchObject({ ok: false, status: 409 });
    m.getLive.mockResolvedValue(live({ priceId: "price_1" }));
    await expect(changePlan("org", "price_1")).resolves.toEqual({ ok: false, status: 409, error: "You're already on this plan." });
  });
});
