import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/db/billing-payments", () => ({ recordRazorpayPayment: m.record }));

import { POST } from "./route";

const SECRET = "hook_secret";
const paid = { event: "order.paid", payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } } };

function post(body: unknown, secret: string | null = SECRET) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["X-Razorpay-Signature"] = createHmac("sha256", secret).update(raw).digest("hex");
  return POST(new Request("http://x/api/webhooks/razorpay", { method: "POST", body: raw, headers }));
}

describe("POST /api/webhooks/razorpay", () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    m.record.mockReset();
    m.record.mockResolvedValue(true);
  });

  it("refuses a wrong or missing signature and records nothing", async () => {
    expect((await post(paid, "other")).status).toBe(401);
    expect((await post(paid, null)).status).toBe(401);
    expect(m.record).not.toHaveBeenCalled();
  });

  it("refuses everything when no webhook secret is set", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect((await post(paid)).status).toBe(401);
  });

  it("records order.paid with the order and payment ids", async () => {
    const res = await post(paid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: true });
    expect(m.record).toHaveBeenCalledWith("order_1", "pay_1");
  });

  it("answers 200 to a repeat that adds nothing, so Razorpay stops sending it", async () => {
    m.record.mockResolvedValue(false);
    const res = await post(paid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: false });
  });

  it("ignores other events with 200", async () => {
    const res = await post({ event: "payment.failed", payload: {} });
    expect(res.status).toBe(200);
    expect(m.record).not.toHaveBeenCalled();
  });

  it("answers 400 to an order.paid without ids", async () => {
    expect((await post({ event: "order.paid", payload: {} })).status).toBe(400);
  });

  it("answers 500 when the database fails, so Razorpay retries", async () => {
    m.record.mockRejectedValue(new Error("db down"));
    const res = await post(paid);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not record the payment." });
  });
});
