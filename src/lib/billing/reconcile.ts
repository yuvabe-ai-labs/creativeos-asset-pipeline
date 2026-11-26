import "server-only";
import { recordRazorpayPayment } from "@/lib/db/billing-payments";
import {
  listSubscriptionsToCheck,
  listUnpaidOrders,
  recordSubscriptionCharge,
  setSubscriptionStatus,
  updateSubscription,
  type CheckableSubscription,
  type SubscriptionStatus,
} from "@/lib/db/billing-subscriptions";
import { cancelSubscription, getSubscription, listOrderPayments, listSubscriptionInvoices } from "./razorpay";
import { PAYMENT_DUE_END_DAYS } from "./constants";

// The check against Razorpay (spec 2026-11-21-failed-payments-design.md, D585). Webhooks can be
// late, missing (Razorpay disables a webhook after 24 hours of failures) or out of order; this
// brings our records in line with Razorpay's, using the same once-only functions as the webhook,
// so running it twice changes nothing. Every agency is checked on its own: one failure never
// stops the rest.

export { PAYMENT_DUE_END_DAYS };

const STATUS_FROM_RAZORPAY: Record<string, SubscriptionStatus> = {
  created: "created",
  authenticated: "created",
  active: "active",
  pending: "payment_due",
  halted: "payment_due",
  paused: "payment_due",
  cancelled: "ended",
  completed: "ended",
  expired: "ended",
};

const iso = (unix: number | null | undefined) => (typeof unix === "number" && unix > 0 ? new Date(unix * 1000).toISOString() : null);

export type ReconcileReport = { checked: number; charges: number; statuses: number; ended: number; orders: number; failed: number };

async function checkSubscription(sub: CheckableSubscription, now: number, report: ReconcileReport): Promise<void> {
  const rz = await getSubscription(sub.razorpaySubscriptionId);

  // Charges first, oldest to newest, so the latest one sets the paid period last.
  const invoices = (await listSubscriptionInvoices(sub.razorpaySubscriptionId))
    .filter((inv) => inv.status === "paid" && inv.payment_id && inv.billing_end)
    .sort((a, b) => (a.billing_start ?? 0) - (b.billing_start ?? 0));
  for (const inv of invoices) {
    const recorded = await recordSubscriptionCharge({
      razorpaySubscriptionId: sub.razorpaySubscriptionId,
      razorpayPlanId: rz.plan_id,
      paymentId: inv.payment_id as string,
      orderId: inv.order_id,
      totalMinor: inv.amount_paid ?? inv.amount,
      periodStart: iso(inv.billing_start) ?? new Date(now).toISOString(),
      periodEnd: iso(inv.billing_end) as string,
    });
    if (recorded) report.charges += 1;
  }

  const status = STATUS_FROM_RAZORPAY[rz.status];
  if (status && status !== sub.status && !(status === "active" && sub.status === "cancelling")) {
    if (await setSubscriptionStatus(sub.razorpaySubscriptionId, status, { start: iso(rz.current_start), end: iso(rz.current_end) })) report.statuses += 1;
  }

  // Unpaid for 30 days: end the plan so no more invoices pile up. The owner saw this date on Billing.
  const dueSince = sub.paymentDueSince ? new Date(sub.paymentDueSince).getTime() : null;
  if ((status ?? sub.status) === "payment_due" && dueSince !== null && now - dueSince >= PAYMENT_DUE_END_DAYS * 86_400_000) {
    await cancelSubscription(sub.razorpaySubscriptionId, false).catch((e) => console.warn("[billing check] cancel refused", sub.razorpaySubscriptionId, e));
    await updateSubscription(sub.id, { status: "ended", cancelAtPeriodEnd: false });
    report.ended += 1;
  }
}

/** Plans: each live subscription against Razorpay. Nightly. */
export async function reconcileSubscriptions(limit = 200, now = Date.now()): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, charges: 0, statuses: 0, ended: 0, orders: 0, failed: 0 };
  for (const sub of await listSubscriptionsToCheck(limit)) {
    report.checked += 1;
    try {
      await checkSubscription(sub, now, report);
    } catch (e) {
      report.failed += 1;
      console.error("[billing check] subscription failed", sub.razorpaySubscriptionId, e instanceof Error ? e.message : e);
    }
  }
  return report;
}

/** Top-ups: orders still unpaid 15 minutes after they started (up to 3 days back). Hourly. */
export async function reconcileOrders(limit = 100, now = Date.now()): Promise<ReconcileReport> {
  const report: ReconcileReport = { checked: 0, charges: 0, statuses: 0, ended: 0, orders: 0, failed: 0 };
  const olderThan = new Date(now - 15 * 60_000).toISOString();
  const within = new Date(now - 3 * 86_400_000).toISOString();
  for (const orderId of await listUnpaidOrders(olderThan, within, limit)) {
    report.checked += 1;
    try {
      const captured = (await listOrderPayments(orderId)).find((p) => p.status === "captured");
      if (captured && (await recordRazorpayPayment(orderId, captured.id))) report.orders += 1;
    } catch (e) {
      report.failed += 1;
      console.error("[billing check] order failed", orderId, e instanceof Error ? e.message : e);
    }
  }
  return report;
}
