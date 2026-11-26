import "server-only";
import { getOrgById } from "@/lib/db/organizations";
import { getPurchasablePrice } from "@/lib/db/billing-subscriptions";
import { getNextPriceId, getPendingMove, listPendingMoves, recordPlanMove, type PendingMove } from "@/lib/db/billing-plan-moves";
import { loginEmails, ownerIds } from "@/lib/db/people";
import { sendEmail } from "@/lib/email/send";
import { appLink, planPriceChangeEmail } from "@/lib/email/templates";
import { razorpayPlanFor } from "./subscriptions";
import { schedulePlanChange, type ChangeOutcome } from "./plan-change";
import { withGst } from "./gst";
import { askForApproval } from "./price-approval";

// After an admin changes a plan's price, every running plan on the old price moves to the new one
// from its next renewal, on Razorpay too (D593). The `move-plan-price` task runs this once per price
// change and the nightly check runs it again for anything left (a task that never ran, a payment
// that was due, Razorpay unreachable). Each plan is read again just before Razorpay is asked and
// nothing is sent when Razorpay already has the plan, so a re-run changes nothing.

export type MoveReport = { checked: number; moved: number; refused: number; waiting: number; failed: number };

/** Plans handled at once: Razorpay's API is shared with checkouts. */
const AT_ONCE = 5;
/** Busy or unreachable: two more tries a few seconds apart, then the nightly check. */
const RETRY_DELAYS_MS = [2_000, 8_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function scheduleWithRetries(subscriptionId: string, planId: string): Promise<ChangeOutcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await schedulePlanChange(subscriptionId, planId);
    } catch (e) {
      if (attempt >= RETRY_DELAYS_MS.length) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** Tells the owners the new price and the day it starts. Best effort: the move has happened. */
async function tellOwners(sub: PendingMove): Promise<void> {
  try {
    const [org, from, to, owners] = await Promise.all([getOrgById(sub.orgId), getPurchasablePrice(sub.priceId), getPurchasablePrice(sub.nextPriceId), ownerIds(sub.orgId)]);
    const emails = await loginEmails(owners);
    if (!org || !to || emails.length === 0) return;
    const result = await sendEmail(
      planPriceChangeEmail({
        to: emails,
        agency: org.name,
        plan: to.product.name,
        samePlan: !from || from.product.id === to.product.id,
        fromMinor: from ? withGst(from.amountMinor) : null,
        toMinor: withGst(to.amountMinor),
        credits: to.credits,
        startsAt: sub.currentPeriodEnd,
        link: appLink("/billing"),
      }),
    );
    if (!result.sent) console.warn("[billing] price change email not sent", sub.orgId, result.reason);
  } catch (e) {
    console.error("[billing] could not send the price change email", sub.orgId, e);
  }
}

/** One plan's move. "skipped": no longer waiting to move (set up, refused, changed or ended). */
async function moveOne(id: string): Promise<"moved" | "refused" | "waiting" | "skipped"> {
  const sub = await getPendingMove(id);
  if (!sub) return "skipped";
  // A payment is due: Razorpay can't change it now. It moves once paid (the nightly check).
  if (sub.status !== "active") return "waiting";
  const price = await getPurchasablePrice(sub.nextPriceId);
  if (!price) throw new Error(`price ${sub.nextPriceId} not found`);
  const outcome = await scheduleWithRetries(sub.razorpaySubscriptionId, await razorpayPlanFor(price));
  if (outcome.kind === "waiting") return "waiting";

  const refused = outcome.kind === "refused" ? outcome.refused : null;
  if (!(await recordPlanMove(sub.id, sub.nextPriceId, refused))) {
    // The plan changed while Razorpay was asked (the owner picked another, or a newer price came
    // in): put Razorpay on what it says now. Asking for the plan Razorpay already has sends nothing.
    const latest = await getNextPriceId(sub.id);
    if (latest && latest !== sub.nextPriceId && outcome.kind === "scheduled") {
      const now = await getPurchasablePrice(latest);
      if (now) await scheduleWithRetries(sub.razorpaySubscriptionId, await razorpayPlanFor(now));
    }
    return "skipped";
  }
  // UPI or a bank mandate: the owner approves the new price by the end date record_plan_move gave,
  // or the plan ends then (D595).
  if (refused === "upi" || refused === "emandate") await askForApproval(sub.id);
  if (refused) return "refused";
  await tellOwners(sub);
  return "moved";
}

/** Every running plan whose move isn't set up on Razorpay yet, a few at a time. */
export async function movePendingPlans(limit = 500): Promise<MoveReport> {
  const report: MoveReport = { checked: 0, moved: 0, refused: 0, waiting: 0, failed: 0 };
  const pending = await listPendingMoves(limit);
  for (let i = 0; i < pending.length; i += AT_ONCE) {
    await Promise.all(
      pending.slice(i, i + AT_ONCE).map(async (sub) => {
        report.checked += 1;
        try {
          const result = await moveOne(sub.id);
          if (result !== "skipped") report[result] += 1;
        } catch (e) {
          report.failed += 1;
          console.error("[billing] plan move failed; the nightly check tries again", sub.razorpaySubscriptionId, e instanceof Error ? e.message : e);
        }
      }),
    );
  }
  return report;
}
