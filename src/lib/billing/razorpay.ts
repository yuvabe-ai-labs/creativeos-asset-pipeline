import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay through its REST API, no SDK (D514). The setting names are the same in every
// environment. Live keys work only where RAZORPAY_LIVE=1 (production alone), and test keys only
// where it is not set (D530): a key pasted into the wrong place stops payments instead of charging
// real cards on staging or running production on test money.

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

const START_FAILED = "Could not start the payment.";

function keys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const live = process.env.RAZORPAY_LIVE === "1";
  if (!keyId.startsWith(live ? "rzp_live_" : "rzp_test_")) {
    console.error(`[razorpay] RAZORPAY_KEY_ID is not a ${live ? "live" : "test"} key; ${live ? "RAZORPAY_LIVE=1 needs live keys" : "live keys need RAZORPAY_LIVE=1"}`);
    return null;
  }
  return { keyId, keySecret };
}

/** The public key id Checkout needs in the browser. */
export function razorpayKeyId(): string {
  const k = keys();
  if (!k) throw new Error(START_FAILED);
  return k.keyId;
}

// One call to Razorpay's REST API with basic auth. A refusal is logged with its body and thrown as
// `failMessage`, which is plain enough to show a person.
async function razorpay<T>(path: string, init: { method: "GET" | "POST" | "PATCH"; body?: unknown }, failMessage: string): Promise<T> {
  const k = keys();
  if (!k) {
    console.error("[razorpay] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set");
    throw new Error(failMessage);
  }
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${k.keyId}:${k.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    console.error("[razorpay] refused", init.method, path, res.status, await res.text().catch(() => ""));
    throw new Error(failMessage);
  }
  return (await res.json()) as T;
}

export async function createOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpay<RazorpayOrder>("/orders", { method: "POST", body: { amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes } }, START_FAILED);
}

const PLAN_FAILED = "Could not start the plan.";

/** A Razorpay plan: a fixed monthly amount, GST included (one per price row, D521). */
export async function createPlan(input: { amountPaise: number; name: string; description: string; notes: Record<string, string> }): Promise<{ id: string }> {
  return razorpay<{ id: string }>(
    "/plans",
    { method: "POST", body: { period: "monthly", interval: 1, item: { name: input.name, description: input.description, amount: input.amountPaise, currency: "INR" }, notes: input.notes } },
    PLAN_FAILED,
  );
}

export type RazorpaySubscription = {
  id: string;
  status: string;
  plan_id: string;
  current_start?: number | null;
  current_end?: number | null;
  /** Razorpay's hosted page for this subscription: pay a due charge, change card or method. */
  short_url?: string | null;
};

const READ_FAILED = "Could not reach the payment service.";

export async function getSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpay<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" }, READ_FAILED);
}

export type RazorpayInvoice = {
  id: string;
  status: string;
  payment_id: string | null;
  order_id: string | null;
  amount: number;
  amount_paid?: number | null;
  billing_start: number | null;
  billing_end: number | null;
};

/** A subscription's invoices (one per charge), newest first as Razorpay returns them. */
export async function listSubscriptionInvoices(subscriptionId: string): Promise<RazorpayInvoice[]> {
  const res = await razorpay<{ items: RazorpayInvoice[] }>(`/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=100`, { method: "GET" }, READ_FAILED);
  return res.items ?? [];
}

/** The payments made against an order (a top-up). */
export async function listOrderPayments(orderId: string): Promise<{ id: string; status: string }[]> {
  const res = await razorpay<{ items: { id: string; status: string }[] }>(`/orders/${encodeURIComponent(orderId)}/payments`, { method: "GET" }, READ_FAILED);
  return res.items ?? [];
}

/** A monthly subscription to a plan, charged up to `totalCount` times. */
export async function createSubscription(input: { planId: string; totalCount: number; notes: Record<string, string> }): Promise<RazorpaySubscription> {
  return razorpay<RazorpaySubscription>(
    "/subscriptions",
    { method: "POST", body: { plan_id: input.planId, total_count: input.totalCount, customer_notify: 1, notes: input.notes } },
    PLAN_FAILED,
  );
}

/** Cancels now, or at the end of the paid cycle. */
export async function cancelSubscription(subscriptionId: string, atCycleEnd: boolean): Promise<RazorpaySubscription> {
  return razorpay<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { method: "POST", body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } },
    "Could not cancel the plan.",
  );
}

/** Moves the subscription to another plan from the next cycle. */
export async function changeSubscriptionPlan(subscriptionId: string, planId: string): Promise<RazorpaySubscription> {
  return razorpay<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "PATCH", body: { plan_id: planId, schedule_change_at: "cycle_end" } },
    "Could not change the plan.",
  );
}

function hmacMatches(secret: string | undefined, message: string, signature: string | null | undefined): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"), "utf8");
  const given = Buffer.from(signature, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Checkout's handler signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string | null | undefined): boolean {
  return hmacMatches(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`, signature);
}

/** Checkout's handler signature for a subscription: HMAC-SHA256 of "payment_id|subscription_id". */
export function verifySubscriptionSignature(paymentId: string, subscriptionId: string, signature: string | null | undefined): boolean {
  return hmacMatches(process.env.RAZORPAY_KEY_SECRET, `${paymentId}|${subscriptionId}`, signature);
}

/** X-Razorpay-Signature: HMAC-SHA256 of the raw body, unparsed, with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean {
  return hmacMatches(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody, signature);
}
