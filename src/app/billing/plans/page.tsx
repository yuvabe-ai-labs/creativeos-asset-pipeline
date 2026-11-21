import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBillingOwner } from "@/lib/billing/owner-page";
import { getOwnerBilling } from "@/lib/db/billing-owner";
import { PlansGrid } from "@/components/billing/owner/plans-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans · CreativeOS" };

// The owner's plans (D523): the same cards as Admin › Plans and prices, to pick or change a plan.
export default async function BillingPlansPage() {
  const orgId = await requireBillingOwner();
  const billing = await getOwnerBilling(orgId);
  if (!billing || billing.mode !== "plans") notFound();
  const freeLeft = billing.grants.filter((g) => g.kind === "free").reduce((s, g) => s + g.left, 0);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <Link href="/billing" className="text-sm text-muted-foreground hover:text-foreground">← Billing</Link>
      <div className="mt-4 mb-8 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Plans</h1>
        <p className="text-sm text-muted-foreground">
          Every plan renews monthly with new credits.
          {freeLeft > 0 ? " Your free credits are used first, and stay until they end." : ""}
        </p>
      </div>
      <PlansGrid plans={billing.plans} subscription={billing.subscription} />
    </main>
  );
}
