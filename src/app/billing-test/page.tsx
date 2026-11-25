import { notFound } from "next/navigation";
import { check } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { isBillingTestEnabled } from "@/lib/billing/test-mode";
import { PAGE_CONTAINER } from "@/components/shared/page-header";
import { TestTopUp } from "@/components/billing/test-top-up";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buy credits (test) — CreativeOS" };

// D573: only where RAZORPAY_TEST_PAGE=1, and only for the agency's owner (view_credits);
// anyone else gets the 404 page.
export default async function BillingTestPage() {
  if (!isBillingTestEnabled()) notFound();
  const { caller, effectiveOrgId } = await resolveActingCaller();
  if (check(accessOf(caller), "view_credits", { orgId: effectiveOrgId, clientId: null }) !== "allow") notFound();
  return (
    <main className={PAGE_CONTAINER}>
      <div className="mx-auto max-w-md space-y-6">
        <TestTopUp />
        <p className="text-sm text-muted-foreground">Plans and top-ups are on the Billing page.</p>
      </div>
    </main>
  );
}
