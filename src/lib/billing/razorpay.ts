import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay through its REST API, no SDK (D514). Test or live is decided only by which keys are
// set; the names are the same in every environment.

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

const START_FAILED = "Could not start the payment.";

function keys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

/** The public key id Checkout needs in the browser. */
export function razorpayKeyId(): string {
  const k = keys();
  if (!k) throw new Error(START_FAILED);
  return k.keyId;
}

export async function createOrder(input: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const k = keys();
  if (!k) {
    console.error("[razorpay] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set");
    throw new Error(START_FAILED);
  }
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${k.keyId}:${k.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes }),
  });
  if (!res.ok) {
    console.error("[razorpay] order refused", res.status, await res.text().catch(() => ""));
    throw new Error(START_FAILED);
  }
  return (await res.json()) as RazorpayOrder;
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

/** X-Razorpay-Signature: HMAC-SHA256 of the raw body, unparsed, with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean {
  return hmacMatches(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody, signature);
}
