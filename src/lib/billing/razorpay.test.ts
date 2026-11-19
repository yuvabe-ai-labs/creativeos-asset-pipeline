import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder, verifyCheckoutSignature, verifyWebhookSignature } from "./razorpay";

const hex = (secret: string, message: string) => createHmac("sha256", secret).update(message).digest("hex");

describe("Razorpay signatures", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "hook_secret";
  });

  it("accepts a Checkout signature of order|payment made with the key secret", () => {
    expect(verifyCheckoutSignature("order_1", "pay_1", hex("key_secret", "order_1|pay_1"))).toBe(true);
  });

  it("refuses a Checkout signature for other ids, another secret, or none", () => {
    expect(verifyCheckoutSignature("order_1", "pay_2", hex("key_secret", "order_1|pay_1"))).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", hex("hook_secret", "order_1|pay_1"))).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", undefined)).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", "short")).toBe(false);
  });

  it("accepts a webhook signature of the exact raw body made with the webhook secret", () => {
    const raw = '{"event":"order.paid"}';
    expect(verifyWebhookSignature(raw, hex("hook_secret", raw))).toBe(true);
    expect(verifyWebhookSignature('{"event": "order.paid"}', hex("hook_secret", raw))).toBe(false);
    expect(verifyWebhookSignature(raw, hex("key_secret", raw))).toBe(false);
  });

  it("refuses every webhook when no webhook secret is set", () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const raw = "{}";
    expect(verifyWebhookSignature(raw, hex("", raw))).toBe(false);
  });
});

describe("createOrder", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_id";
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts an INR order with basic auth and returns it", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "order_1", amount: 10000, currency: "INR", status: "created" }) });
    const order = await createOrder({ amountPaise: 10000, receipt: "test-1", notes: { org_id: "org-1" } });
    expect(order.id).toBe("order_1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("rzp_test_id:key_secret").toString("base64")}`);
    expect(JSON.parse(init.body)).toEqual({ amount: 10000, currency: "INR", receipt: "test-1", notes: { org_id: "org-1" } });
  });

  it("throws plain words when Razorpay refuses", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" });
    await expect(createOrder({ amountPaise: 10000, receipt: "r", notes: {} })).rejects.toThrow("Could not start the payment.");
  });

  it("throws plain words when the keys are not set", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    await expect(createOrder({ amountPaise: 10000, receipt: "r", notes: {} })).rejects.toThrow("Could not start the payment.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
