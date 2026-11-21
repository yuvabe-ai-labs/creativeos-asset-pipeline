import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireBillingOwner } from "@/lib/billing/owner-page";
import { getOwnerBilling } from "@/lib/db/billing-owner";
import { summarizeBilling } from "@/lib/billing/summary";
import { CreditGrantList } from "@/components/billing/credit-grant-list";
import { PlanSummary } from "@/components/billing/owner/plan-summary";
import { TopUpSection } from "@/components/billing/owner/top-up-section";
import { PaymentsList } from "@/components/billing/owner/payments-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing · CreativeOS" };

const n = (v: number) => v.toLocaleString("en-IN");

// The owner's Billing (spec 2026-11-21-owner-billing-design.md, D523): the plan, the credits by kind
// with their ends, top-ups, and payments. One parallel read; a managed agency has no billing page.
export default async function BillingPage() {
  const orgId = await requireBillingOwner();
  const billing = await getOwnerBilling(orgId);
  if (!billing || billing.mode !== "plans") notFound();
  const summary = summarizeBilling(billing.mode, billing.grants, billing.subscription);
  const planRunning =
    !!billing.subscription && (billing.subscription.status === "active" || billing.subscription.status === "cancelling") &&
    !!billing.subscription.currentPeriodEnd && new Date(billing.subscription.currentPeriodEnd) > new Date();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Your plan, your credits and your payments. Only you can see this page.</p>
      </div>
      <div className="flex flex-col gap-10">
        <Card className="gap-0 divide-y divide-border py-0 shadow-card">
          <PlanSummary subscription={billing.subscription} />
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
              <span className="text-eyebrow text-muted-foreground">Credits</span>
              <span className="font-display text-xl font-semibold tracking-tight">{n(summary.left)} left</span>
            </div>
            <CreditGrantList grants={billing.grants} empty="No credits right now. AI runs start again when you pick a plan or top up." />
          </div>
        </Card>
        <TopUpSection packs={billing.packs} planRunning={planRunning} />
        <PaymentsList payments={billing.payments} />
      </div>
    </main>
  );
}
