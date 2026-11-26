import "server-only";
import { recordRazorpayPayment } from "@/lib/db/billing-payments";
import { recordPriceApproval } from "@/lib/db/billing-approvals";
import { markRazorpayEvent, recordSubscriptionCharge, setSubscriptionStatus, storeRazorpayEvent, type SubscriptionStatus } from "@/lib/db/billing-subscriptions";

// What each signed Razorpay webhook does (spec 2026-11-21-monthly-plans-design.md, Flow 3). Every
// event is stored once first; one already processed is skipped, so a repeat changes nothing.

type Entity = Record<string, unknown>;
export type RazorpayWebhook = {
  event?: string;
  created_at?: number;
  payload?: { subscription?: { entity?: Entity }; payment?: { entity?: Entity } };
};

const STATUS_FOR: Record<string, SubscriptionStatus> = {
  "subscription.activated": "active",
  "subscription.resumed": "active",
  "subscription.pending": "payment_due",
  "subscription.halted": "payment_due",
  "subscription.cancelled": "ended",
  "subscription.completed": "ended",
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const when = (unix: unknown) => (typeof unix === "number" && unix > 0 ? new Date(unix * 1000).toISOString() : null);

export type WebhookOutcome = { status: 200 | 400 | 500; body: Record<string, unknown> };

/** A stable id for the event: Razorpay's header, else one built from the body. */
export function eventIdFor(header: string | null, body: RazorpayWebhook): string {
  if (header) return header;
  const entity = body.payload?.payment?.entity ?? body.payload?.subscription?.entity;
  return `${body.event ?? "unknown"}:${str(entity?.id) ?? "none"}:${body.created_at ?? 0}`;
}

async function apply(body: RazorpayWebhook): Promise<Record<string, unknown>> {
  const event = body.event ?? "";
  const sub = body.payload?.subscription?.entity;
  const payment = body.payload?.payment?.entity;

  if (event === "order.paid") {
    const paymentId = str(payment?.id);
    const orderId = str(payment?.order_id);
    if (!paymentId || !orderId) throw new Error("order.paid without a payment");
    return { added: await recordRazorpayPayment(orderId, paymentId) };
  }

  if (event === "subscription.charged") {
    const subscriptionId = str(sub?.id);
    const planId = str(sub?.plan_id);
    const paymentId = str(payment?.id);
    const periodStart = when(sub?.current_start);
    const periodEnd = when(sub?.current_end);
    if (!subscriptionId || !planId || !paymentId || !periodStart || !periodEnd || typeof payment?.amount !== "number") {
      throw new Error("subscription.charged without its subscription, payment or period");
    }
    const recorded = await recordSubscriptionCharge({
      razorpaySubscriptionId: subscriptionId,
      razorpayPlanId: planId,
      paymentId,
      orderId: str(payment.order_id),
      totalMinor: payment.amount,
      periodStart,
      periodEnd,
    });
    if (!recorded) console.warn("[razorpay] charge changed nothing (unknown subscription or payment already recorded)", subscriptionId, paymentId);
    return { recorded };
  }

  // The owner authorised a subscription at a new price that starts later (D595). Every checkout
  // sends this; only an approval waiting to start records anything, once.
  if (event === "subscription.authenticated") {
    const subscriptionId = str(sub?.id);
    if (!subscriptionId) throw new Error(`${event} without a subscription`);
    return { approved: await recordPriceApproval(subscriptionId) };
  }

  const status = STATUS_FOR[event];
  if (status) {
    const subscriptionId = str(sub?.id);
    if (!subscriptionId) throw new Error(`${event} without a subscription`);
    const changed = await setSubscriptionStatus(subscriptionId, status, { start: when(sub?.current_start), end: when(sub?.current_end) });
    return { changed };
  }

  return { ignored: true };
}

export async function handleRazorpayWebhook(eventId: string, body: RazorpayWebhook): Promise<WebhookOutcome> {
  if (!body.event) return { status: 400, body: { error: "Missing event" } };
  const seen = await storeRazorpayEvent(eventId, body.event, body);
  if (seen === "processed") return { status: 200, body: { duplicate: true } };
  try {
    const result = await apply(body);
    await markRazorpayEvent(eventId, { error: null });
    return { status: 200, body: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[razorpay] webhook failed", body.event, eventId, message);
    await markRazorpayEvent(eventId, { error: message }).catch(() => {});
    // 500 so Razorpay sends it again; the stored event is tried again then.
    return { status: 500, body: { error: "Could not process the event." } };
  }
}
