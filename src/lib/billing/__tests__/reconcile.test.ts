import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  listSubs: vi.fn(), listOrders: vi.fn(), charge: vi.fn(), status: vi.fn(), update: vi.fn(), recordOrder: vi.fn(),
  getSub: vi.fn(), invoices: vi.fn(), orderPayments: vi.fn(), cancel: vi.fn(), approve: vi.fn(),
}));
vi.mock("@/lib/db/billing-approvals", () => ({ recordPriceApproval: m.approve }));
vi.mock("@/lib/db/billing-subscriptions", () => ({
  listSubscriptionsToCheck: m.listSubs, listUnpaidOrders: m.listOrders, recordSubscriptionCharge: m.charge, setSubscriptionStatus: m.status, updateSubscription: m.update,
}));
vi.mock("@/lib/db/billing-payments", () => ({ recordRazorpayPayment: m.recordOrder }));
vi.mock("../razorpay", () => ({ getSubscription: m.getSub, listSubscriptionInvoices: m.invoices, listOrderPayments: m.orderPayments, cancelSubscription: m.cancel }));

import { reconcileOrders, reconcileSubscriptions } from "../reconcile";

const NOW = Date.parse("2026-12-30T00:00:00Z");
const sub = (over: Partial<Record<string, unknown>> = {}) => ({ id: "row", orgId: "org", status: "active", razorpaySubscriptionId: "sub_1", currentPeriodEnd: "2026-12-21T00:00:00Z", paymentDueSince: null, ...over });
const invoice = (payment: string, start: number, end: number) => ({ id: `inv_${payment}`, status: "paid", payment_id: payment, order_id: `order_${payment}`, amount: 1_416_000, amount_paid: 1_416_000, billing_start: start, billing_end: end });

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.listSubs.mockResolvedValue([sub()]);
  m.getSub.mockResolvedValue({ id: "sub_1", status: "active", plan_id: "plan_1", current_start: 1_797_000_000, current_end: 1_799_600_000 });
  m.invoices.mockResolvedValue([]);
  m.charge.mockResolvedValue(true);
  m.status.mockResolvedValue(true);
  m.cancel.mockResolvedValue({});
});

describe("the nightly plan check", () => {
  it("records missed charges oldest first, so the latest sets the paid period", async () => {
    m.invoices.mockResolvedValue([invoice("pay_new", 1_797_000_000, 1_799_600_000), invoice("pay_old", 1_794_400_000, 1_797_000_000), { ...invoice("pay_x", 1, 2), status: "issued" }]);
    const report = await reconcileSubscriptions(200, NOW);
    expect(m.charge.mock.calls.map((c) => c[0].paymentId)).toEqual(["pay_old", "pay_new"]);
    expect(m.charge.mock.calls[0][0]).toMatchObject({ razorpaySubscriptionId: "sub_1", razorpayPlanId: "plan_1", totalMinor: 1_416_000, orderId: "order_pay_old" });
    expect(report.charges).toBe(2);
  });

  it("records an approval whose webhook was missed, and leaves an unfinished one alone (D595)", async () => {
    m.approve.mockResolvedValue(true);
    m.listSubs.mockResolvedValue([sub({ status: "scheduled", currentPeriodEnd: null, approvedAt: null })]);
    m.getSub.mockResolvedValue({ id: "sub_1", status: "authenticated", plan_id: "plan_1" });
    await expect(reconcileSubscriptions(200, NOW)).resolves.toMatchObject({ statuses: 1 });
    expect(m.approve).toHaveBeenCalledWith("sub_1");
    m.getSub.mockResolvedValue({ id: "sub_1", status: "created", plan_id: "plan_1" });
    m.approve.mockClear();
    await reconcileSubscriptions(200, NOW);
    expect(m.approve).not.toHaveBeenCalled();
    expect(m.status).not.toHaveBeenCalled();
    // Not authorised by its start: it expired, so it ends.
    m.getSub.mockResolvedValue({ id: "sub_1", status: "expired", plan_id: "plan_1" });
    await reconcileSubscriptions(200, NOW);
    expect(m.status).toHaveBeenCalledWith("sub_1", "ended", { start: null, end: null });
  });

  it("brings the status in line with Razorpay, but keeps a cancelled plan cancelling", async () => {
    m.getSub.mockResolvedValue({ id: "sub_1", status: "halted", plan_id: "plan_1" });
    await reconcileSubscriptions(200, NOW);
    expect(m.status).toHaveBeenCalledWith("sub_1", "payment_due", { start: null, end: null });

    m.status.mockClear();
    m.listSubs.mockResolvedValue([sub({ status: "cancelling" })]);
    m.getSub.mockResolvedValue({ id: "sub_1", status: "active", plan_id: "plan_1" });
    await reconcileSubscriptions(200, NOW);
    expect(m.status).not.toHaveBeenCalled();
  });

  it("ends a plan unpaid for 30 days, and not a day sooner", async () => {
    m.getSub.mockResolvedValue({ id: "sub_1", status: "halted", plan_id: "plan_1" });
    m.listSubs.mockResolvedValue([sub({ status: "payment_due", paymentDueSince: "2026-11-30T00:00:00Z" })]);
    const report = await reconcileSubscriptions(200, NOW);
    expect(m.cancel).toHaveBeenCalledWith("sub_1", false);
    expect(m.update).toHaveBeenCalledWith("row", { status: "ended", cancelAtPeriodEnd: false });
    expect(report.ended).toBe(1);

    m.cancel.mockClear();
    m.listSubs.mockResolvedValue([sub({ status: "payment_due", paymentDueSince: "2026-12-01T00:00:01Z" })]);
    await reconcileSubscriptions(200, NOW);
    expect(m.cancel).not.toHaveBeenCalled();
  });

  it("keeps going when one agency fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.listSubs.mockResolvedValue([sub({ razorpaySubscriptionId: "sub_bad" }), sub()]);
    m.getSub.mockImplementation(async (id: string) => {
      if (id === "sub_bad") throw new Error("down");
      return { id, status: "active", plan_id: "plan_1" };
    });
    const report = await reconcileSubscriptions(200, NOW);
    expect(report).toMatchObject({ checked: 2, failed: 1 });
  });
});

describe("the hourly top-up check", () => {
  it("records a top-up whose payment went through but whose webhook never came", async () => {
    m.listOrders.mockResolvedValue(["order_1", "order_2"]);
    m.orderPayments.mockImplementation(async (id: string) => (id === "order_1" ? [{ id: "pay_f", status: "failed" }, { id: "pay_1", status: "captured" }] : [{ id: "pay_2", status: "failed" }]));
    m.recordOrder.mockResolvedValue(true);
    const report = await reconcileOrders(100, NOW);
    expect(m.recordOrder).toHaveBeenCalledTimes(1);
    expect(m.recordOrder).toHaveBeenCalledWith("order_1", "pay_1");
    expect(report).toMatchObject({ checked: 2, orders: 1 });
  });

  it("looks only at orders between 15 minutes and 3 days old", async () => {
    m.listOrders.mockResolvedValue([]);
    await reconcileOrders(100, NOW);
    expect(m.listOrders).toHaveBeenCalledWith(new Date(NOW - 15 * 60_000).toISOString(), new Date(NOW - 3 * 86_400_000).toISOString(), 100);
  });
});
