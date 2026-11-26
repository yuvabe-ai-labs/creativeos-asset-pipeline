import "server-only";
import { cancelScheduledChange, changeSubscriptionPlan, getScheduledPlan, getSubscription, RazorpayError } from "./razorpay";
import type { MoveRefusal } from "./plan-move-copy";

// Putting a subscription on another Razorpay plan from its next renewal (D593), for the owner's own
// change and for an admin's price change alike, so the last decision is what Razorpay charges.
//
// Razorpay's rules (https://razorpay.com/docs/api/payments/subscriptions/update-subscription/ and
// the Subscriptions FAQs): only a subscription paid by card can be changed, never one paid by UPI
// or a bank mandate; only while it is authenticated or active; "cycle_end" waits for the end of the
// paid cycle. The docs don't say whether a second change replaces a scheduled one, so a scheduled
// change to another plan is cancelled first. Nothing is sent when Razorpay already has the plan, so
// asking again is always safe.

export type ChangeOutcome = { kind: "scheduled" } | { kind: "waiting" } | { kind: "refused"; refused: MoveRefusal };

const SCHEDULED: ChangeOutcome = { kind: "scheduled" };
const WAITING: ChangeOutcome = { kind: "waiting" };

const METHOD_REFUSAL: Record<string, MoveRefusal> = { upi: "upi", emandate: "emandate", nach: "emandate" };

/**
 * What a refused call means for the move: a refusal that will never change (UPI, bank mandate or
 * another 4xx), "waiting" (the subscription isn't active right now: try again once it is), or null
 * when it is worth trying again soon (Razorpay unreachable, busy, rate limited or failing).
 */
export function refusalOf(e: unknown): MoveRefusal | "waiting" | null {
  if (!(e instanceof RazorpayError)) return null;
  const d = e.description.toLowerCase();
  if (e.status === 0 || e.status === 429 || e.status >= 500) return null;
  if (d.includes("another subscription operation is in progress")) return null;
  if (/\bupi\b/.test(d)) return "upi";
  if (d.includes("emandate") || d.includes("e-mandate") || d.includes("nach")) return "emandate";
  if (d.includes("not in authenticated or active state")) return "waiting";
  return e.status >= 400 && e.status < 500 ? "other" : null;
}

async function schedule(subscriptionId: string, planId: string): Promise<ChangeOutcome> {
  const sub = await getSubscription(subscriptionId);
  if (sub.status !== "active" && sub.status !== "authenticated") return WAITING;
  const pending = sub.has_scheduled_changes === false ? null : await getScheduledPlan(subscriptionId);
  if (pending === planId) return SCHEDULED;
  if (sub.plan_id === planId) {
    // Already charged on it: only a scheduled change elsewhere would take it off.
    if (pending !== null) await cancelScheduledChange(subscriptionId);
    return SCHEDULED;
  }
  const method = sub.payment_method ? METHOD_REFUSAL[sub.payment_method.toLowerCase()] : undefined;
  if (method) return { kind: "refused", refused: method };
  if (pending !== null) await cancelScheduledChange(subscriptionId);
  await changeSubscriptionPlan(subscriptionId, planId);
  return SCHEDULED;
}

/** Asks Razorpay to charge `planId` from the next renewal. Throws only when trying again soon may
 *  work; a refusal that won't change, or a subscription that isn't active, is the outcome. */
export async function schedulePlanChange(subscriptionId: string, planId: string): Promise<ChangeOutcome> {
  try {
    return await schedule(subscriptionId, planId);
  } catch (e) {
    const refusal = refusalOf(e);
    if (refusal === null) throw e;
    if (refusal === "waiting") return WAITING;
    console.warn("[billing] plan change refused", subscriptionId, refusal, e instanceof RazorpayError ? e.description : "");
    return { kind: "refused", refused: refusal };
  }
}
