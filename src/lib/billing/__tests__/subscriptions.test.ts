import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  getOrgById: vi.fn(), getLive: vi.fn(), getPrice: vi.fn(), insert: vi.fn(), savePlan: vi.fn(), update: vi.fn(),
  createPlan: vi.fn(), createSubscription: vi.fn(), cancel: vi.fn(), change: vi.fn(), getSubscription: vi.fn(),
  scheduled: vi.fn(), cancelScheduled: vi.fn(), drop: vi.fn(), newer: vi.fn(),
}));
vi.mock("../price-approval", () => ({ dropPendingApproval: m.drop }));
vi.mock("@/lib/db/billing-approvals", () => ({ getNewerPrice: m.newer }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: m.getOrgById }));
vi.mock("@/lib/db/billing-subscriptions", () => ({
  getLiveSubscription: m.getLive, getPurchasablePrice: m.getPrice, insertSubscription: m.insert, savePriceRazorpayPlan: m.savePlan, updateSubscription: m.update,
}));
vi.mock("../razorpay", async (importOriginal) => ({
  RazorpayError: (await importOriginal<typeof import("../razorpay")>()).RazorpayError,
  createPlan: m.createPlan, createSubscription: m.createSubscription, cancelSubscription: m.cancel, changeSubscriptionPlan: m.change, getSubscription: m.getSubscription, razorpayKeyId: () => "rzp_test_id",
  getScheduledPlan: m.scheduled, cancelScheduledChange: m.cancelScheduled,
}));

import { startSubscription, cancelPlan, changePlan, payNowLink, approveNewPrice } from "../subscriptions";
import { RazorpayError } from "../razorpay";

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
  m.drop.mockResolvedValue("none");
  m.newer.mockResolvedValue(null);
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
    m.getSubscription.mockResolvedValue({ id: "sub_old", status: "active", plan_id: "plan_old", has_scheduled_changes: false });
    await expect(changePlan("org", "price_1")).resolves.toEqual({ ok: true, value: { from: "2026-12-21T00:00:00Z" } });
    expect(m.change).toHaveBeenCalledWith("sub_old", "plan_new");
    expect(m.update).toHaveBeenCalledWith("row_1", { nextPriceId: "price_1" });
  });

  it("replaces a price change Yuvabe set up: the owner's choice is the last one (D593)", async () => {
    m.getLive.mockResolvedValue(live());
    m.getSubscription.mockResolvedValue({ id: "sub_old", status: "active", plan_id: "plan_old", has_scheduled_changes: true });
    m.scheduled.mockResolvedValue("plan_admin");
    await expect(changePlan("org", "price_1")).resolves.toMatchObject({ ok: true });
    expect(m.cancelScheduled).toHaveBeenCalledWith("sub_old");
    expect(m.change).toHaveBeenCalledWith("sub_old", "plan_new");
  });

  it("says plainly that a plan paid by UPI or bank mandate can't be changed", async () => {
    m.getLive.mockResolvedValue(live());
    m.getSubscription.mockResolvedValue({ id: "sub_old", status: "active", plan_id: "plan_old", has_scheduled_changes: false });
    m.change.mockRejectedValue(new RazorpayError("Could not change the plan.", 400, "subscriptions cannot be updated when payment mode is emandate"));
    await expect(changePlan("org", "price_1")).resolves.toEqual({ ok: false, status: 409, error: "A plan paid by bank mandate can't be changed. Cancel it, then pick the new plan when it ends." });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("refuses to change a cancelled plan or to the same price", async () => {
    m.getLive.mockResolvedValue(live({ status: "cancelling" }));
    await expect(changePlan("org", "price_1")).resolves.toMatchObject({ ok: false, status: 409 });
    m.getLive.mockResolvedValue(live({ priceId: "price_1" }));
    await expect(changePlan("org", "price_1")).resolves.toEqual({ ok: false, status: 409, error: "You're already on this plan." });
  });
});

describe("a payment due (D585)", () => {
  it("ends the plan at once when cancelled, since no paid month is left", async () => {
    m.getLive.mockResolvedValue(live({ status: "payment_due" }));
    await expect(cancelPlan("org")).resolves.toEqual({ ok: true, value: { endsAt: null } });
    expect(m.cancel).toHaveBeenCalledWith("sub_old", false);
    expect(m.update).toHaveBeenCalledWith("row_1", { status: "ended", cancelAtPeriodEnd: false });
  });

  it("refuses a plan change until it is paid", async () => {
    m.getLive.mockResolvedValue(live({ status: "payment_due" }));
    await expect(changePlan("org", "price_1")).resolves.toEqual({ ok: false, status: 409, error: "Pay the amount due first, then change your plan." });
    expect(m.change).not.toHaveBeenCalled();
  });

  it("gives the payment page to pay it, and nothing when nothing is due", async () => {
    m.getLive.mockResolvedValue(live({ status: "payment_due" }));
    m.getSubscription.mockResolvedValue({ id: "sub_old", status: "halted", plan_id: "p", short_url: "https://rzp.io/i/abc" });
    await expect(payNowLink("org")).resolves.toEqual({ ok: true, value: { url: "https://rzp.io/i/abc" } });
    m.getLive.mockResolvedValue(live());
    await expect(payNowLink("org")).resolves.toEqual({ ok: false, status: 409, error: "Nothing is due right now." });
  });
});

describe("approveNewPrice (D595)", () => {
  const NOW = Date.parse("2026-11-26T00:00:00Z");
  const asked = (over: Partial<Record<string, unknown>> = {}) =>
    live({ currentPeriodEnd: "2026-12-03T00:00:00Z", approval: { state: "asked", priceId: "price_1", planName: "Studio", amountMinor: 1_200_000, credits: 100_000, endsAt: "2026-12-03T00:00:00Z" }, ...over });

  it("subscribes to the new price from the plan's end date, quietly, and saves it as scheduled", async () => {
    m.getLive.mockResolvedValue(asked());
    await expect(approveNewPrice("org", NOW)).resolves.toEqual({ ok: true, value: { subscriptionId: "sub_new", keyId: "rzp_test_id", startsAt: "2026-12-03T00:00:00.000Z" } });
    expect(m.drop).toHaveBeenCalledWith("org", { unapprovedOnly: true });
    expect(m.createSubscription).toHaveBeenCalledWith({
      planId: "plan_new", totalCount: 120, notifyCustomer: false, startAt: Date.parse("2026-12-03T00:00:00Z") / 1000,
      notes: { org_id: "org", price_id: "price_1", replaces: "row_1" },
    });
    expect(m.insert).toHaveBeenCalledWith({ orgId: "org", priceId: "price_1", razorpaySubscriptionId: "sub_new", scheduled: { startsAt: "2026-12-03T00:00:00.000Z", nextPriceId: null } });
  });

  it("starts at once when the end date has passed, stopping a due plan first", async () => {
    m.getLive.mockResolvedValue(asked({ status: "payment_due", currentPeriodEnd: "2026-11-03T00:00:00Z", approval: { state: "asked", priceId: "price_1", planName: "Studio", amountMinor: 1, credits: 1, endsAt: "2026-11-20T00:00:00Z" } }));
    await expect(approveNewPrice("org", NOW)).resolves.toMatchObject({ ok: true, value: { startsAt: null } });
    expect(m.cancel).toHaveBeenCalledWith("sub_old", false);
    expect(m.createSubscription.mock.calls[0][0]).not.toHaveProperty("startAt");
  });

  it("marks an approval of a replaced price to move to the newest one", async () => {
    m.getLive.mockResolvedValue(asked());
    m.newer.mockResolvedValue("price_2");
    await approveNewPrice("org", NOW);
    expect(m.insert.mock.calls[0][0].scheduled.nextPriceId).toBe("price_2");
  });

  it("refuses when nothing is asked, or it is already approved", async () => {
    m.getLive.mockResolvedValue(live({ approval: null }));
    await expect(approveNewPrice("org", NOW)).resolves.toMatchObject({ ok: false, status: 409 });
    m.getLive.mockResolvedValue(asked());
    m.drop.mockResolvedValue("approved");
    await expect(approveNewPrice("org", NOW)).resolves.toMatchObject({ ok: false, error: "You've already approved the new price." });
    expect(m.createSubscription).not.toHaveBeenCalled();
  });

  it("drops a waiting approval when the owner cancels or changes plan", async () => {
    m.getLive.mockResolvedValue(asked());
    await cancelPlan("org");
    expect(m.drop).toHaveBeenCalledWith("org");
    expect(m.update).toHaveBeenCalledWith("row_1", { endsUnlessApprovedAt: null });
    expect(m.cancel).toHaveBeenCalledWith("sub_old", true);
  });
});
