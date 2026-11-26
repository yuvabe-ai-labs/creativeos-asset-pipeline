import "server-only";
import { getOrgById } from "@/lib/db/organizations";
import { getPurchasablePrice, updateSubscription } from "@/lib/db/billing-subscriptions";
import {
  approvedOrgIds,
  claimApprovalReminder,
  getAskedPlan,
  getScheduledSubscription,
  listApprovalReminders,
  listEndingPlans,
  recordPriceApproval,
  type AskedPlan,
} from "@/lib/db/billing-approvals";
import { loginEmails, ownerIds } from "@/lib/db/people";
import { sendEmail } from "@/lib/email/send";
import { appLink, planPriceApprovalEmail } from "@/lib/email/templates";
import { cancelSubscription, getSubscription, RazorpayError } from "./razorpay";
import { withGst } from "./gst";

// A plan paid by UPI or a bank mandate can't move to a new price, so its owner approves the new
// price or the plan ends on its date (D595, migration 0104). This file is the background side: the
// ask after a refusal, the end of the old subscription's final cycle, the reminder, and dropping an
// approval the owner no longer needs. The owner's own step is approveNewPrice (subscriptions.ts).
//
// Razorpay's rules (Subscriptions docs, workflow and cancel-subscription): a cycle-end cancel only
// covers the cycle running now, so the old subscription is stopped once its final cycle has begun,
// never earlier; an approval subscription not started yet (created or authenticated) can only be
// cancelled at once.

/** How close (ms) the cycle running now must end to the end date to be the final one: the end date
 *  is counted in calendar months, Razorpay's cycles may land a day or two apart. */
const FINAL_CYCLE_SLACK_MS = 3 * 86_400_000;
/** The reminder goes this long before the end date. */
const REMIND_BEFORE_MS = 3 * 86_400_000;

/** Ends the approval subscription waiting beside the plan (the owner cancelled, changed or picked
 *  another plan, or a newer price is asked). With `unapprovedOnly`, one already authorised is kept,
 *  and one Razorpay says is authorised though its webhook hasn't come is recorded as approved. */
export async function dropPendingApproval(orgId: string, opts: { unapprovedOnly?: boolean } = {}): Promise<"none" | "dropped" | "approved"> {
  const sched = await getScheduledSubscription(orgId);
  if (!sched) return "none";
  if (opts.unapprovedOnly && sched.approvedAt) return "approved";
  if (sched.razorpaySubscriptionId) {
    if (opts.unapprovedOnly) {
      const rz = await getSubscription(sched.razorpaySubscriptionId).catch(() => null);
      if (rz?.status === "authenticated") {
        await recordPriceApproval(sched.razorpaySubscriptionId);
        return "approved";
      }
    }
    // Not started yet, so it can only be cancelled at once. One already expired or cancelled refuses,
    // which changes nothing.
    await cancelSubscription(sched.razorpaySubscriptionId, false).catch((e) => console.warn("[billing] approval subscription not cancelled", sched.razorpaySubscriptionId, e instanceof Error ? e.message : e));
  }
  await updateSubscription(sched.id, { status: "ended" });
  return "dropped";
}

/** The owners' addresses and the agency's name; null when there is no one to tell. */
async function ownersOf(orgId: string): Promise<{ agency: string; to: string[] } | null> {
  const [org, owners] = await Promise.all([getOrgById(orgId), ownerIds(orgId)]);
  const to = await loginEmails(owners);
  return org && to.length > 0 ? { agency: org.name, to } : null;
}

/** Emails the owners that the new price needs their approval by the end date. Best effort. */
async function tellOwners(plan: AskedPlan, reminder: boolean): Promise<void> {
  try {
    if (!plan.nextPriceId) return;
    const [who, price] = await Promise.all([ownersOf(plan.orgId), getPurchasablePrice(plan.nextPriceId)]);
    if (!who || !price) return;
    const result = await sendEmail(
      planPriceApprovalEmail({
        to: who.to,
        agency: who.agency,
        plan: price.product.name,
        toMinor: withGst(price.amountMinor),
        credits: price.credits,
        endsAt: plan.endsAt,
        reminder,
        link: appLink("/billing"),
      }),
    );
    if (!result.sent) console.warn("[billing] approval email not sent", plan.orgId, result.reason);
  } catch (e) {
    console.error("[billing] could not send the approval email", plan.orgId, e);
  }
}

/** After a plan's move was refused as UPI or a bank mandate (record_plan_move gave it an end date):
 *  drop an approval made for an earlier price, then ask the owners. */
export async function askForApproval(subscriptionRowId: string): Promise<void> {
  const plan = await getAskedPlan(subscriptionRowId);
  if (!plan) return;
  const earlier = await dropPendingApproval(plan.orgId, { unapprovedOnly: true });
  // Approved an earlier price meanwhile: nothing more to ask (that subscription moves on its own).
  if (earlier === "approved") return;
  await tellOwners(plan, false);
}

export type ApprovalReport = { stopped: number; reminded: number; failed: number };

/** A cycle-end cancel Razorpay refuses because one is already set reads as done. */
function alreadyStopping(e: unknown): boolean {
  return e instanceof RazorpayError && e.status >= 400 && e.status < 500 && /cancel/i.test(e.description);
}

/**
 * Plans with an end date whose final cycle has begun: Razorpay stops the old subscription at the
 * end of this cycle (approved or not: an approved one is followed by its new subscription that
 * day). The end date follows the cycle Razorpay actually runs, so a renewal that went through
 * anyway (a missed night) is used up before the plan ends.
 */
export async function stopFinalCycles(now = Date.now(), limit = 200): Promise<ApprovalReport> {
  const report: ApprovalReport = { stopped: 0, reminded: 0, failed: 0 };
  for (const plan of await listEndingPlans(["active"], limit)) {
    if (!plan.razorpaySubscriptionId || !plan.currentPeriodEnd) continue;
    const cycleEnd = new Date(plan.currentPeriodEnd).getTime();
    if (cycleEnd < new Date(plan.endsAt).getTime() - FINAL_CYCLE_SLACK_MS || cycleEnd <= now) continue;
    try {
      try {
        await cancelSubscription(plan.razorpaySubscriptionId, true);
      } catch (e) {
        if (!alreadyStopping(e)) throw e;
      }
      await updateSubscription(plan.id, { status: "cancelling", cancelAtPeriodEnd: true, endsUnlessApprovedAt: plan.currentPeriodEnd });
      report.stopped += 1;
    } catch (e) {
      report.failed += 1;
      console.error("[billing] final cycle not stopped; tried again tonight", plan.razorpaySubscriptionId, e instanceof Error ? e.message : e);
    }
  }
  return report;
}

/** Owners still asked 3 days before the end date get one reminder. */
export async function remindApprovals(now = Date.now(), limit = 200): Promise<ApprovalReport> {
  const report: ApprovalReport = { stopped: 0, reminded: 0, failed: 0 };
  const due = await listApprovalReminders(new Date(now).toISOString(), new Date(now + REMIND_BEFORE_MS).toISOString(), limit);
  const approved = await approvedOrgIds([...new Set(due.map((p) => p.orgId))]);
  for (const plan of due) {
    if (approved.has(plan.orgId)) continue;
    try {
      if (!(await claimApprovalReminder(plan.id))) continue;
      await tellOwners(plan, true);
      report.reminded += 1;
    } catch (e) {
      report.failed += 1;
      console.error("[billing] approval reminder failed", plan.orgId, e instanceof Error ? e.message : e);
    }
  }
  return report;
}
