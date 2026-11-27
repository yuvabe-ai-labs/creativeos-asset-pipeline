import "server-only";
import { claimOwnerEmail, listDueOwnerEmails, logOwnerEmails, releaseOwnerEmail, type DueOwnerEmail, type OwnerEmailLog } from "@/lib/db/owner-credit-emails";
import { sendEmail, type Email } from "@/lib/email/send";
import { appLink, freeCreditsEndingEmail, lowCreditsEmail } from "@/lib/email/templates";
import { creditPercent } from "@/lib/admin/agencies-list";
import { LOW_CREDITS_SHARE, summarizeBilling } from "./summary";

// Two emails to a paying agency's owners (D596, migration 0105), from the hourly check:
//   - credits running low: Billing's own "low" state, once per credit period (until new credits
//     arrive: a renewal, a top-up, credits Yuvabe adds);
//   - free credits ending: 3 days before a free grant ends while the agency has no plan, once per
//     grant (a grant given with less than 3 days left was told in the welcome email).
// One read finds both for every agency. Each send is claimed in the database first, so two runs
// never send it twice; a failed send gives the claim back and the next run tries again.

/** The free-credits email goes this long before the grant ends. */
export const FREE_ENDING_NOTICE_HOURS = 72;
/** At most this many emails a run; the rest go next hour. */
const LIMIT = 200;

export type OwnerEmailReport = { lowCredits: number; freeEnding: number; failed: number };

/** Whether the agency's plan is running, so a top-up can be bought (as Billing's top-up section). */
function planRunning(s: DueOwnerEmail["subscription"], now: number): boolean {
  return !!s && (s.status === "active" || s.status === "cancelling") && !!s.currentPeriodEnd && new Date(s.currentPeriodEnd).getTime() > now;
}

/** The email and its billing_log row for one due item; null when Billing's rule says it isn't due. */
export function composeOwnerEmail(due: DueOwnerEmail, now = Date.now()): { email: Email; log: Record<string, unknown> } | null {
  if (due.kind === "low_credits") {
    const summary = summarizeBilling("plans", due.grants, due.subscription);
    if (summary.state !== "low") return null;
    const usedPercent = creditPercent(summary.total - summary.left, summary.total);
    const soonest = due.grants.filter((g) => g.left > 0).sort((a, b) => a.endsAt.localeCompare(b.endsAt))[0] ?? null;
    const onPlan = planRunning(due.subscription, now);
    return {
      email: lowCreditsEmail({
        to: due.to,
        agency: due.agency,
        usedPercent,
        left: summary.left,
        total: summary.total,
        soonest: soonest && { left: soonest.left, endsAt: soonest.endsAt },
        onPlan,
        link: appLink(onPlan ? "/billing" : "/billing/plans"),
      }),
      log: { email: "low_credits", used_percent: usedPercent, left: summary.left, total: summary.total },
    };
  }
  const grant = due.grants.find((g) => g.id === due.grantId);
  if (!grant || grant.left <= 0) return null;
  return {
    email: freeCreditsEndingEmail({ to: due.to, agency: due.agency, left: grant.left, endsAt: grant.endsAt, link: appLink("/billing/plans") }),
    log: { email: "free_ending", grant_id: grant.id, left: grant.left, ends_at: grant.endsAt },
  };
}

/** Sends every owner email due now. A failure on one never stops the others. */
export async function sendOwnerCreditEmails(now = Date.now()): Promise<OwnerEmailReport> {
  const report: OwnerEmailReport = { lowCredits: 0, freeEnding: 0, failed: 0 };
  const sent: OwnerEmailLog[] = [];
  for (const due of await listDueOwnerEmails(LOW_CREDITS_SHARE, FREE_ENDING_NOTICE_HOURS, LIMIT)) {
    const built = composeOwnerEmail(due, now);
    if (!built) continue;
    let claimed: string | null = null;
    try {
      claimed = await claimOwnerEmail(due);
      if (!claimed) continue;
      const result = await sendEmail(built.email);
      if (!result.sent) throw new Error(`not sent: ${result.reason}`);
      sent.push({ orgId: due.orgId, after: built.log });
      if (due.kind === "low_credits") report.lowCredits += 1;
      else report.freeEnding += 1;
    } catch (e) {
      report.failed += 1;
      console.error("[billing] owner email failed; tried again next hour", due.kind, due.orgId, e instanceof Error ? e.message : e);
      if (claimed) {
        await releaseOwnerEmail(due, claimed).catch((err) => console.error("[billing] owner email claim not given back", due.kind, due.orgId, err));
      }
    }
  }
  // The emails have gone; a log that can't be written is reported, never sent again.
  await logOwnerEmails(sent).catch((e) => console.error("[billing] owner email log not written", e));
  return report;
}
