import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  record: vi.fn(), charge: vi.fn(), status: vi.fn(), store: vi.fn(), mark: vi.fn(), approve: vi.fn(),
}));
vi.mock("@/lib/db/billing-approvals", () => ({ recordPriceApproval: m.approve }));
vi.mock("@/lib/db/billing-payments", () => ({ recordRazorpayPayment: m.record }));
vi.mock("@/lib/db/billing-subscriptions", () => ({
  recordSubscriptionCharge: m.charge, setSubscriptionStatus: m.status, storeRazorpayEvent: m.store, markRazorpayEvent: m.mark,
}));

import { POST } from "./route";

const SECRET = "hook_secret";
const paid = { event: "order.paid", payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } } };
const sub = { id: "sub_1", plan_id: "plan_1", current_start: 1_795_000_000, current_end: 1_797_592_000 };
const charged = { event: "subscription.charged", payload: { subscription: { entity: sub }, payment: { entity: { id: "pay_2", order_id: "order_2", amount: 1_416_000 } } } };

function post(body: unknown, opts: { secret?: string | null; eventId?: string } = {}) {
  const raw = JSON.stringify(body);
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Razorpay-Event-Id": opts.eventId ?? "evt_1" };
  if (secret !== null) headers["X-Razorpay-Signature"] = createHmac("sha256", secret).update(raw).digest("hex");
  return POST(new Request("http://x/api/webhooks/razorpay", { method: "POST", body: raw, headers }));
}

describe("POST /api/webhooks/razorpay", () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    for (const fn of Object.values(m)) fn.mockReset();
    m.record.mockResolvedValue(true);
    m.charge.mockResolvedValue(true);
    m.status.mockResolvedValue(true);
    m.store.mockResolvedValue("new");
    m.mark.mockResolvedValue(undefined);
  });

  it("records an approval of a new price when its subscription is authorised (D595)", async () => {
    m.approve.mockResolvedValue(true);
    const res = await post({ event: "subscription.authenticated", payload: { subscription: { entity: sub } } });
    expect(res.status).toBe(200);
    expect(m.approve).toHaveBeenCalledWith("sub_1");
    expect(m.status).not.toHaveBeenCalled();
  });

  it("refuses a wrong or missing signature and stores nothing", async () => {
    expect((await post(paid, { secret: "other" })).status).toBe(401);
    expect((await post(paid, { secret: null })).status).toBe(401);
    expect(m.store).not.toHaveBeenCalled();
  });

  it("refuses everything when no webhook secret is set", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect((await post(paid)).status).toBe(401);
  });

  it("stores the event by Razorpay's id, then records order.paid", async () => {
    const res = await post(paid, { eventId: "evt_9" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: true });
    expect(m.store).toHaveBeenCalledWith("evt_9", "order.paid", paid);
    expect(m.record).toHaveBeenCalledWith("order_1", "pay_1");
    expect(m.mark).toHaveBeenCalledWith("evt_9", { error: null });
  });

  it("skips an event already processed", async () => {
    m.store.mockResolvedValue("processed");
    const res = await post(charged);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ duplicate: true });
    expect(m.charge).not.toHaveBeenCalled();
  });

  it("records a plan charge with the plan, payment, total and paid period", async () => {
    expect((await post(charged)).status).toBe(200);
    expect(m.charge).toHaveBeenCalledWith({
      razorpaySubscriptionId: "sub_1",
      razorpayPlanId: "plan_1",
      paymentId: "pay_2",
      orderId: "order_2",
      totalMinor: 1_416_000,
      periodStart: new Date(1_795_000_000 * 1000).toISOString(),
      periodEnd: new Date(1_797_592_000 * 1000).toISOString(),
    });
  });

  it.each([
    ["subscription.activated", "active"],
    ["subscription.resumed", "active"],
    ["subscription.pending", "payment_due"],
    ["subscription.halted", "payment_due"],
    ["subscription.cancelled", "ended"],
    ["subscription.completed", "ended"],
  ])("moves the plan on %s to %s", async (event, status) => {
    expect((await post({ event, payload: { subscription: { entity: sub } } })).status).toBe(200);
    expect(m.status).toHaveBeenCalledWith("sub_1", status, { start: expect.any(String), end: expect.any(String) });
  });

  it("stores and answers 200 to events it doesn't act on", async () => {
    const res = await post({ event: "payment.captured", payload: { payment: { entity: { id: "pay_3" } } } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expect(m.mark).toHaveBeenCalledWith("evt_1", { error: null });
  });

  it("stores the failure and answers 500 for a charge without its period, so Razorpay sends it again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ ...charged, payload: { ...charged.payload, subscription: { entity: { id: "sub_1", plan_id: "plan_1" } } } });
    expect(res.status).toBe(500);
    expect(m.mark).toHaveBeenCalledWith("evt_1", { error: expect.stringContaining("subscription.charged") });
  });

  it("answers 500 when the database fails, so Razorpay retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.record.mockRejectedValue(new Error("connection reset"));
    expect((await post(paid)).status).toBe(500);
  });

  it("builds an event id from the body when the header is missing", async () => {
    const raw = JSON.stringify({ ...paid, created_at: 1700 });
    const headers = { "X-Razorpay-Signature": createHmac("sha256", SECRET).update(raw).digest("hex") };
    await POST(new Request("http://x/api/webhooks/razorpay", { method: "POST", body: raw, headers }));
    expect(m.store).toHaveBeenCalledWith("order.paid:pay_1:1700", "order.paid", expect.anything());
  });
});
