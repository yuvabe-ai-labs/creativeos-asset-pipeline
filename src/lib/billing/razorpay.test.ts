import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelSubscription, changeSubscriptionPlan, createOrder, createPlan, createSubscription, verifyCheckoutSignature, verifySubscriptionSignature, verifyWebhookSignature } from "./razorpay";

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

describe("keys match the environment (D530)", () => {
  const fetchMock = vi.fn();
  const order = () => createOrder({ amountPaise: 10000, receipt: "r", notes: {} });
  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "order_1", amount: 10000, currency: "INR", status: "created" }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.RAZORPAY_LIVE;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses live keys where RAZORPAY_LIVE is not set", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_live_id";
    await expect(order()).rejects.toThrow("Could not start the payment.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses test keys where RAZORPAY_LIVE=1", async () => {
    process.env.RAZORPAY_LIVE = "1";
    process.env.RAZORPAY_KEY_ID = "rzp_test_id";
    await expect(order()).rejects.toThrow("Could not start the payment.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses live keys where RAZORPAY_LIVE=1", async () => {
    process.env.RAZORPAY_LIVE = "1";
    process.env.RAZORPAY_KEY_ID = "rzp_live_id";
    await expect(order()).resolves.toMatchObject({ id: "order_1" });
  });
});

describe("Razorpay subscriptions", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_id";
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown) => ({ ok: true, json: async () => body, text: async () => "" });
  const sent = () => ({ url: fetchMock.mock.calls[0][0] as string, init: fetchMock.mock.calls[0][1] as RequestInit, body: JSON.parse(fetchMock.mock.calls[0][1].body as string) });

  it("makes a monthly plan with the amount Razorpay charges", async () => {
    fetchMock.mockResolvedValue(ok({ id: "plan_1" }));
    await expect(createPlan({ amountPaise: 1_416_000, name: "Studio", description: "Monthly", notes: { price_id: "p" } })).resolves.toEqual({ id: "plan_1" });
    const { url, body } = sent();
    expect(url).toBe("https://api.razorpay.com/v1/plans");
    expect(body).toEqual({ period: "monthly", interval: 1, item: { name: "Studio", description: "Monthly", amount: 1_416_000, currency: "INR" }, notes: { price_id: "p" } });
  });

  it("subscribes, cancels at the cycle end, and changes plan from the next cycle", async () => {
    fetchMock.mockResolvedValue(ok({ id: "sub_1", status: "created", plan_id: "plan_1" }));
    await createSubscription({ planId: "plan_1", totalCount: 120, notes: { org_id: "o" } });
    expect(sent().body).toEqual({ plan_id: "plan_1", total_count: 120, customer_notify: 1, notes: { org_id: "o" } });
    fetchMock.mockClear();
    await cancelSubscription("sub_1", true);
    expect(sent().url).toBe("https://api.razorpay.com/v1/subscriptions/sub_1/cancel");
    expect(sent().body).toEqual({ cancel_at_cycle_end: 1 });
    fetchMock.mockClear();
    await changeSubscriptionPlan("sub_1", "plan_2");
    expect(sent().init.method).toBe("PATCH");
    expect(sent().body).toEqual({ plan_id: "plan_2", schedule_change_at: "cycle_end" });
  });

  it("throws plain words when Razorpay refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "bad" });
    await expect(createSubscription({ planId: "p", totalCount: 1, notes: {} })).rejects.toThrow("Could not start the plan.");
  });

  it("accepts a subscription Checkout signature of payment|subscription", () => {
    expect(verifySubscriptionSignature("pay_1", "sub_1", hex("key_secret", "pay_1|sub_1"))).toBe(true);
    expect(verifySubscriptionSignature("pay_1", "sub_2", hex("key_secret", "pay_1|sub_1"))).toBe(false);
  });
});
