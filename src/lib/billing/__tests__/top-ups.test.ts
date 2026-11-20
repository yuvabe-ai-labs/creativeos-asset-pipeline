import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ getOrgById: vi.fn(), getLive: vi.fn(), getPrice: vi.fn(), settings: vi.fn(), insert: vi.fn(), createOrder: vi.fn() }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: m.getOrgById }));
vi.mock("@/lib/db/billing-subscriptions", () => ({ getLiveSubscription: m.getLive, getPurchasablePrice: m.getPrice }));
vi.mock("@/lib/db/billing-catalog", () => ({ getBillingSettings: m.settings }));
vi.mock("@/lib/db/billing-payments", () => ({ insertCreatedPayment: m.insert }));
vi.mock("../razorpay", () => ({ createOrder: m.createOrder, razorpayKeyId: () => "rzp_test_id" }));

import { startTopUp } from "../top-ups";

const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
const pack = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "pack_1", amountMinor: 312_500, credits: 25_000, intervalMonths: null, active: true, razorpayPlanId: null,
  product: { id: "prod_t", kind: "topup", name: "Small top-up", active: true, orgId: null }, ...over,
});
const live = (over: Partial<Record<string, unknown>> = {}) => ({ id: "sub_row", status: "active", currentPeriodEnd: future, ...over });

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.getOrgById.mockResolvedValue({ id: "org", billing_mode: "plans" });
  m.getLive.mockResolvedValue(live());
  m.getPrice.mockResolvedValue(pack());
  m.settings.mockResolvedValue({ inrPerUsd: 100 });
  m.createOrder.mockResolvedValue({ id: "order_1" });
});

describe("startTopUp", () => {
  it("orders the pack with GST and saves the payment with its price, plan, tax and rate", async () => {
    await expect(startTopUp("org", "user_1", "pack_1")).resolves.toEqual({
      ok: true, value: { orderId: "order_1", amountPaise: 368_750, credits: 25_000, keyId: "rzp_test_id", name: "Small top-up" },
    });
    expect(m.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 368_750, notes: { org_id: "org", price_id: "pack_1" } }));
    expect(m.insert).toHaveBeenCalledWith({
      orgId: "org", orderId: "order_1", amountPaise: 312_500, credits: 25_000, createdBy: "user_1",
      topUp: { priceId: "pack_1", subscriptionId: "sub_row", taxMinor: 56_250, totalMinor: 368_750, inrPerUsd: 100 },
    });
  });

  it("works on a cancelled plan while its paid month runs", async () => {
    m.getLive.mockResolvedValue(live({ status: "cancelling" }));
    await expect(startTopUp("org", "u", "pack_1")).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ["no plan", null],
    ["a plan waiting for its first payment", live({ status: "created" })],
    ["a payment due", live({ status: "payment_due" })],
    ["a paid month already over", live({ currentPeriodEnd: new Date(Date.now() - 1000).toISOString() })],
  ])("refuses with %s", async (_label, sub) => {
    m.getLive.mockResolvedValue(sub);
    await expect(startTopUp("org", "u", "pack_1")).resolves.toEqual({ ok: false, status: 409, error: "Top-ups need an active plan." });
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("refuses a managed agency", async () => {
    m.getOrgById.mockResolvedValue({ id: "org", billing_mode: "managed" });
    await expect(startTopUp("org", "u", "pack_1")).resolves.toMatchObject({ ok: false, status: 409 });
  });

  it.each([
    ["a plan price", pack({ product: { id: "p", kind: "plan", name: "S", active: true, orgId: null }, intervalMonths: 1 })],
    ["a hidden pack", pack({ product: { id: "p", kind: "topup", name: "T", active: false, orgId: null } })],
    ["a hidden price", pack({ active: false })],
    ["another agency's pack", pack({ product: { id: "p", kind: "topup", name: "T", active: true, orgId: "other" } })],
    ["a missing price", null],
  ])("refuses %s", async (_label, p) => {
    m.getPrice.mockResolvedValue(p);
    await expect(startTopUp("org", "u", "pack_1")).resolves.toEqual({ ok: false, status: 400, error: "That top-up isn't available." });
  });
});
