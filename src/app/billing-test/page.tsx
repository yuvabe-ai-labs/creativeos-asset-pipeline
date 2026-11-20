import { notFound } from "next/navigation";
import { check } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { isBillingTestEnabled } from "@/lib/billing/test-mode";
import { PAGE_CONTAINER } from "@/components/shared/page-header";
import { TestTopUp } from "@/components/billing/test-top-up";
import { TestPlans, type TestPlan } from "@/components/billing/test-plans";
import { getCatalog } from "@/lib/db/billing-catalog";
import { getLiveSubscription } from "@/lib/db/billing-subscriptions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing (test) — CreativeOS" };

// D514: only where RAZORPAY_TEST_PAGE=1, and only for the agency's owner (view_credits);
// anyone else gets the 404 page.
export default async function BillingTestPage() {
  if (!isBillingTestEnabled()) notFound();
  const { caller, effectiveOrgId } = await resolveActingCaller();
  if (check(accessOf(caller), "view_credits", { orgId: effectiveOrgId, clientId: null }) !== "allow") notFound();
  const [catalog, subscription] = await Promise.all([getCatalog(), getLiveSubscription(effectiveOrgId)]);
  // The plans an owner can buy now: shown, with a monthly price that is shown (D521).
  const plans: TestPlan[] = catalog
    .filter((p) => p.kind === "plan" && p.active)
    .flatMap((p) => {
      const price = p.prices.find((pr) => pr.active && pr.interval_months === 1);
      return price ? [{ priceId: price.id, name: p.name, amountMinor: price.amount_minor, credits: price.credits }] : [];
    });
  return (
    <main className={PAGE_CONTAINER}>
      <div className="mx-auto max-w-md space-y-6">
        <TestTopUp />
        <TestPlans plans={plans} subscription={subscription} />
      </div>
    </main>
  );
}
