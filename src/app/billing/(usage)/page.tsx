import { notFound } from "next/navigation";
import { requireBillingOwner } from "@/lib/billing/owner-page";
import { getOwnerBilling } from "@/lib/db/billing-owner";
import { getOrgById } from "@/lib/db/organizations";
import { getUsageOverview } from "@/lib/db/billing-usage";
import { summarizeBilling } from "@/lib/billing/summary";
import { USAGE_PAGE_CLASS } from "@/lib/billing/constants";
import { UsageDashboard } from "@/components/billing/owner/usage/usage-dashboard";
import { PlanSummary } from "@/components/billing/owner/plan-summary";
import { CreditsCard } from "@/components/billing/owner/credits-card";
import { TopUpSection } from "@/components/billing/owner/top-up-section";
import { PaymentsCard } from "@/components/billing/owner/payments-card";
import { RefreshOnBillingChange } from "@/components/billing/owner/refresh-on-billing-change";
import { ManagedCreditsCard } from "@/components/billing/owner/managed-credits-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage · CreativeOS" };

// The owner's Usage page (D582, D597, direction B "Overview"): four numbers, at most one notice,
// where the credits went, and a side column with the plan, credits, top-ups and payments. A managed
// agency (Yuvabe sets its monthly limit) gets the same page without the money column. Two rounds of
// parallel reads: the agency with this month's usage, then a paying agency's billing.
export default async function BillingPage() {
  const orgId = await requireBillingOwner();
  const [org, overview] = await Promise.all([getOrgById(orgId), getUsageOverview(orgId, "this_month")]);
  if (!org) notFound();

  if (org.billing_mode === "managed") {
    const limit = org.monthly_credit_limit === null ? null : Number(org.monthly_credit_limit);
    return (
      <main className={USAGE_PAGE_CLASS}>
        <UsageDashboard initial={overview} standing={{ mode: "managed", limit }} approval={null} side={<ManagedCreditsCard limit={limit} />} />
      </main>
    );
  }

  const billing = await getOwnerBilling(orgId);
  if (!billing || billing.mode !== "plans") notFound();
  const sub = billing.subscription;
  const summary = summarizeBilling(billing.mode, billing.grants, sub);
  const planRunning = !!sub && (sub.status === "active" || sub.status === "cancelling") && !!sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date();
  const plan = sub
    ? { status: sub.status, planName: sub.planName, amountMinor: sub.amountMinor, endsAt: sub.currentPeriodEnd, paymentDueSince: sub.paymentDueSince }
    : null;

  return (
    <main className={USAGE_PAGE_CLASS}>
      <RefreshOnBillingChange />
      <UsageDashboard
        initial={overview}
        standing={{ mode: "plans", summary, plan, planRunning, grants: billing.grants }}
        approval={sub?.approval ?? null}
        side={
          <>
            <PlanSummary subscription={sub} />
            <CreditsCard grants={billing.grants} left={summary.left} />
            <TopUpSection packs={billing.packs} planRunning={planRunning} planEndsAt={sub?.currentPeriodEnd ?? null} />
            <PaymentsCard initial={billing.payments} />
          </>
        }
      />
    </main>
  );
}
