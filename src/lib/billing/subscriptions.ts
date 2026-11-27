import "server-only";
import { getOrgById } from "@/lib/db/organizations";
import {
  getLiveSubscription,
  getPurchasablePrice,
  insertSubscription,
  savePriceRazorpayPlan,
  updateSubscription,
  type PurchasablePrice,
} from "@/lib/db/billing-subscriptions";
import { getNewerPrice } from "@/lib/db/billing-approvals";
import { cancelSubscription, createPlan, createSubscription, getSubscription, razorpayKeyId } from "./razorpay";
import { withGst } from "./gst";
import { schedulePlanChange } from "./plan-change";
import { dropPendingApproval } from "./price-approval";
import type { MoveRefusal } from "./plan-move-copy";

// The owner's plan steps (spec 2026-11-21-monthly-plans-design.md). Each answers either what the
// browser needs next, or a refusal in plain words. Credits only ever come from the webhook.

export type StepResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; error: string };

const refuse = (status: 400 | 404 | 409, error: string) => ({ ok: false as const, status, error });

/** Razorpay charges up to 120 months (10 years); the owner cancels long before. */
const TOTAL_CHARGES = 120;

function checkPlanPrice(price: PurchasablePrice | null, orgId: string): string | null {
  if (!price || price.product.kind !== "plan" || price.intervalMonths !== 1) return "That plan isn't available.";
  if (!price.active || !price.product.active) return "That plan isn't available.";
  if (price.product.orgId !== null && price.product.orgId !== orgId) return "That plan isn't available.";
  return null;
}

/** The Razorpay plan for a price, made on first use (one per price row; prices never change). */
export async function razorpayPlanFor(price: PurchasablePrice): Promise<string> {
  if (price.razorpayPlanId) return price.razorpayPlanId;
  const plan = await createPlan({
    amountPaise: withGst(price.amountMinor),
    name: price.product.name,
    description: `${price.credits.toLocaleString("en-IN")} credits a month`,
    notes: { price_id: price.id },
  });
  return savePriceRazorpayPlan(price.id, plan.id);
}

export async function startSubscription(orgId: string, priceId: string): Promise<StepResult<{ subscriptionId: string; keyId: string }>> {
  const [org, price, live] = await Promise.all([getOrgById(orgId), getPurchasablePrice(priceId), getLiveSubscription(orgId)]);
  if (!org) return refuse(404, "Agency not found.");
  if (org.billing_mode !== "plans") return refuse(409, "Your agency's credits are looked after by Yuvabe.");
  const unavailable = checkPlanPrice(price, orgId);
  if (unavailable || !price) return refuse(400, unavailable ?? "That plan isn't available.");

  if (live) {
    if (live.status !== "created") return refuse(409, "You already have a plan. Change it from billing.");
    // Checkout was closed before paying: drop that attempt and start again.
    if (live.razorpaySubscriptionId) await cancelSubscription(live.razorpaySubscriptionId, false).catch((e) => console.warn("[billing] stale subscription not cancelled", e));
    await updateSubscription(live.id, { status: "ended" });
  }
  // A new price approved for a plan that has since ended (D595): the plan picked now replaces it.
  await dropPendingApproval(orgId);

  const planId = await razorpayPlanFor(price);
  const sub = await createSubscription({ planId, totalCount: TOTAL_CHARGES, notes: { org_id: orgId, price_id: price.id } });
  await insertSubscription({ orgId, priceId: price.id, razorpaySubscriptionId: sub.id });
  return { ok: true, value: { subscriptionId: sub.id, keyId: razorpayKeyId() } };
}

/** Stops the next charge; the plan works until the paid month ends. */
export async function cancelPlan(orgId: string): Promise<StepResult<{ endsAt: string | null }>> {
  const live = await getLiveSubscription(orgId);
  if (!live || !live.razorpaySubscriptionId || live.status === "created") return refuse(404, "You don't have a plan to cancel.");
  // A new price waiting for approval, or approved, goes too: the plan ends and nothing follows (D595).
  if (live.approval) {
    await dropPendingApproval(orgId);
    await updateSubscription(live.id, { endsUnlessApprovedAt: null });
  }
  if (live.status === "cancelling") return { ok: true, value: { endsAt: live.currentPeriodEnd } };
  // A payment is due: there is no paid month left to use, so the plan ends now (D585).
  if (live.status === "payment_due") {
    await cancelSubscription(live.razorpaySubscriptionId, false);
    await updateSubscription(live.id, { status: "ended", cancelAtPeriodEnd: false });
    return { ok: true, value: { endsAt: null } };
  }
  await cancelSubscription(live.razorpaySubscriptionId, true);
  await updateSubscription(live.id, { status: "cancelling", cancelAtPeriodEnd: true });
  return { ok: true, value: { endsAt: live.currentPeriodEnd } };
}

/** Why the owner's own change can't be made, in their words. */
const CHANGE_REFUSED: Record<MoveRefusal, string> = {
  upi: "A plan paid by UPI can't be changed. Cancel it, then pick the new plan when it ends.",
  emandate: "A plan paid by bank mandate can't be changed. Cancel it, then pick the new plan when it ends.",
  other: "Could not change the plan. Try again later.",
};

/** Moves the plan to another price from the next payment. The latest choice wins: one Yuvabe set up
 *  after a price change is replaced, on Razorpay too (D593). */
export async function changePlan(orgId: string, priceId: string): Promise<StepResult<{ from: string | null }>> {
  const [live, price] = await Promise.all([getLiveSubscription(orgId), getPurchasablePrice(priceId)]);
  if (!live || !live.razorpaySubscriptionId || live.status === "created") return refuse(404, "You don't have a plan to change.");
  if (live.status === "cancelling") return refuse(409, "Your plan is cancelled. Pick a plan again when it ends.");
  if (live.status === "payment_due") return refuse(409, "Pay the amount due first, then change your plan.");
  const unavailable = checkPlanPrice(price, orgId);
  if (unavailable || !price) return refuse(400, unavailable ?? "That plan isn't available.");
  if (price.id === live.priceId) return refuse(409, "You're already on this plan.");
  const planId = await razorpayPlanFor(price);
  const outcome = await schedulePlanChange(live.razorpaySubscriptionId, planId);
  if (outcome.kind === "refused") return refuse(409, CHANGE_REFUSED[outcome.refused]);
  if (outcome.kind === "waiting") return refuse(409, "Your plan can't be changed right now. Try again later.");
  // The owner's choice replaces a new price waiting for approval (D595).
  if (live.approval) await dropPendingApproval(orgId);
  await updateSubscription(live.id, { nextPriceId: price.id, ...(live.approval ? { endsUnlessApprovedAt: null } : {}) });
  return { ok: true, value: { from: live.currentPeriodEnd } };
}

/** An approval subscription starts at once when its day is this close (Razorpay needs start_at in
 *  the future). */
const START_LEAD_MS = 10 * 60_000;
/** The final cycle Razorpay runs may end a day or two from the end date counted in months. */
const FINAL_CYCLE_SLACK_MS = 3 * 86_400_000;

/**
 * The owner approves a new price their way of paying can't move to (D595): a new subscription at
 * that price whose first charge is the day the plan would end. Checkout authorises it with a small
 * refunded amount; the webhook records the approval and the first charge makes it the plan. Asking
 * again replaces an attempt never finished. If the day has passed, it starts now.
 */
export async function approveNewPrice(orgId: string, now = Date.now()): Promise<StepResult<{ subscriptionId: string; keyId: string; startsAt: string | null }>> {
  const live = await getLiveSubscription(orgId);
  const ask = live?.approval;
  if (!live || !ask) return refuse(409, "There's no new price to approve.");
  if (ask.state === "approved") return refuse(409, "You've already approved the new price.");
  const price = await getPurchasablePrice(ask.priceId);
  if (!price || price.product.kind !== "plan" || price.intervalMonths !== 1) return refuse(409, "That price isn't available. Pick a plan when yours ends.");

  if ((await dropPendingApproval(orgId, { unapprovedOnly: true })) === "approved") return refuse(409, "You've already approved the new price.");

  // The day the old subscription's last paid cycle ends: Razorpay's own date once that cycle runs.
  const endsAt = new Date(ask.endsAt).getTime();
  const cycleEnd = live.currentPeriodEnd ? new Date(live.currentPeriodEnd).getTime() : null;
  const startAt = cycleEnd !== null && Math.abs(cycleEnd - endsAt) <= FINAL_CYCLE_SLACK_MS ? cycleEnd : endsAt;
  const later = startAt - now > START_LEAD_MS;
  // The day has passed with a payment due: there is no paid month to finish, so the old one stops now.
  if (!later && live.status === "payment_due" && live.razorpaySubscriptionId) {
    await cancelSubscription(live.razorpaySubscriptionId, false).catch((e) => console.warn("[billing] due plan not cancelled", e instanceof Error ? e.message : e));
  }

  const [planId, newer] = await Promise.all([razorpayPlanFor(price), getNewerPrice(price.id)]);
  const sub = await createSubscription({
    planId,
    totalCount: TOTAL_CHARGES,
    notes: { org_id: orgId, price_id: price.id, replaces: live.id },
    notifyCustomer: false,
    ...(later ? { startAt: Math.floor(startAt / 1000) } : {}),
  });
  const startsAt = later ? new Date(startAt).toISOString() : null;
  await insertSubscription({ orgId, priceId: price.id, razorpaySubscriptionId: sub.id, scheduled: { startsAt, nextPriceId: newer } });
  return { ok: true, value: { subscriptionId: sub.id, keyId: razorpayKeyId(), startsAt } };
}

/** Where the owner pays a due charge (D585): Razorpay's hosted page for the subscription, which
 *  retries the card, takes a new one, or switches to UPI or a bank mandate. Paying there brings
 *  the plan back; the webhook adds the month's credits. */
export async function payNowLink(orgId: string): Promise<StepResult<{ url: string }>> {
  const live = await getLiveSubscription(orgId);
  if (!live || !live.razorpaySubscriptionId || live.status !== "payment_due") return refuse(409, "Nothing is due right now.");
  const sub = await getSubscription(live.razorpaySubscriptionId);
  if (!sub.short_url) return refuse(409, "The payment page isn't ready yet. Check your email for the payment request.");
  return { ok: true, value: { url: sub.short_url } };
}
