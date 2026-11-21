"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCancelPlan } from "@/hooks/queries/billing";
import type { LiveSubscription } from "@/lib/db/billing-subscriptions";
import { formatRupees } from "@/lib/billing/pricing";
import { ApiError } from "@/services/read-json";
import { ConfirmStepDialog } from "./confirm-step-dialog";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// The owner's plan at the top of Billing (D523): which plan, when it renews or ends, a due payment
// as the one warning, and Change plan / Cancel plan. No plan: one way to pick one.
export function PlanSummary({ subscription }: { subscription: LiveSubscription | null }) {
  const router = useRouter();
  const cancel = useCancelPlan();
  const paid = subscription && subscription.status !== "created" ? subscription : null;

  if (!paid) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex flex-col gap-1">
          <span className="font-display text-xl font-semibold tracking-tight">No plan yet</span>
          <span className="text-sm text-muted-foreground">Pick a monthly plan. Its credits are added as soon as the payment goes through.</span>
        </div>
        <Button nativeButton={false} render={<Link href="/billing/plans" />}>See plans</Button>
      </div>
    );
  }

  const end = paid.currentPeriodEnd ? day(paid.currentPeriodEnd) : null;
  const line =
    paid.status === "cancelling" ? `Cancelled. Works until ${end ?? "the paid month ends"}.`
    : paid.status === "payment_due" ? "Your payment didn't go through, so AI runs are paused. Check your email for the payment request, or pay with another method. Nothing is lost."
    : `Renews ${end ?? "every month"}${paid.nextPriceId ? ". Your new plan starts then." : "."}`;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 p-6">
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xl font-semibold tracking-tight">{paid.planName ?? "Your plan"}</span>
          {paid.status === "payment_due" ? <Badge variant="destructive">Payment due</Badge> : paid.status === "cancelling" ? <Badge variant="outline">Cancelled</Badge> : null}
        </span>
        {paid.amountMinor !== null && paid.credits !== null && (
          <span className="text-sm text-muted-foreground">
            {formatRupees(paid.amountMinor)} a month + GST · {paid.credits.toLocaleString("en-IN")} credits every month
          </span>
        )}
        <span className={paid.status === "payment_due" ? "flex items-start gap-1.5 text-sm text-foreground" : "text-sm text-muted-foreground"}>
          {paid.status === "payment_due" && <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" strokeWidth={1.5} />}
          {line}
        </span>
      </div>
      {paid.status !== "cancelling" && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/billing/plans" />}>Change plan</Button>
          <ConfirmStepDialog
            trigger={<Button variant="ghost" size="sm">Cancel plan</Button>}
            title="Cancel your plan?"
            description={`There's no refund. Your plan and its credits work until ${end ?? "the paid month ends"}, then AI runs stop until you pick a plan again. Everything you made stays.`}
            confirmLabel="Cancel plan"
            onConfirm={async () => {
              try {
                await cancel.mutateAsync();
                router.refresh();
                return null;
              } catch (e) {
                return e instanceof ApiError ? e.message : "Could not cancel the plan.";
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
