"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCancelPlan } from "@/hooks/queries/billing";
import type { LiveSubscription } from "@/lib/db/billing-subscriptions";
import { formatRupees } from "@/lib/billing/pricing";
import { ownerRenewalLine } from "@/lib/billing/plan-move-copy";
import { ApiError } from "@/services/read-json";
import { ConfirmStepDialog } from "./confirm-step-dialog";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function PlanCard({ badge, children }: { badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="gap-3 p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">Plan</h2>
        {badge}
      </div>
      {children}
    </Card>
  );
}

// The owner's plan in the Usage page's side column (D582, D597): which plan, when it renews or ends,
// and Change plan / Cancel plan. No plan: one way to pick one. A due payment is marked here; its
// Pay now is the page's notice.
export function PlanSummary({ subscription }: { subscription: LiveSubscription | null }) {
  const router = useRouter();
  const cancel = useCancelPlan();
  const paid = subscription && subscription.status !== "created" ? subscription : null;

  if (!paid) {
    return (
      <PlanCard>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">No plan yet</span>
          <span className="text-sm text-muted-foreground">Pick a monthly plan. Its credits are added as soon as the payment goes through.</span>
        </div>
        <Button className="w-fit" variant="outline" size="sm" nativeButton={false} render={<Link href="/billing/plans" />}>See plans</Button>
      </PlanCard>
    );
  }

  const end = paid.currentPeriodEnd ? day(paid.currentPeriodEnd) : null;
  // Ending because a new price waits for approval, not because the owner cancelled (D595).
  const approval = paid.approval;
  const line =
    paid.status === "cancelling" && approval
      ? approval.state === "asked"
        ? `Ends ${day(approval.endsAt)} unless you approve the new price.`
        : `Continues ${approval.startsAt ? `on ${day(approval.startsAt)}` : "soon"} at the new price.`
    : paid.status === "cancelling" ? `Cancelled. Works until ${end ?? "the paid month ends"}.`
    : paid.status === "payment_due" ? "AI runs are paused until the payment goes through."
    : ownerRenewalLine(paid.planName, paid.currentPeriodEnd, paid.next);
  const badge =
    paid.status === "payment_due" ? <Badge variant="destructive">Payment due</Badge>
    : paid.status === "cancelling" && approval?.state === "asked" ? <Badge variant="outline">New price to approve</Badge>
    : paid.status === "cancelling" && !approval ? <Badge variant="outline">Cancelled</Badge>
    : null;

  return (
    <PlanCard badge={badge}>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{paid.planName ?? "Your plan"}</span>
        {paid.amountMinor !== null && paid.credits !== null && (
          <span className="text-sm text-muted-foreground">
            {formatRupees(paid.amountMinor)} a month + GST · {paid.credits.toLocaleString("en-IN")} credits every month
          </span>
        )}
        <span className="text-sm text-muted-foreground">{line}</span>
      </div>
      {(paid.status !== "cancelling" || approval) && (
        <div className="flex flex-wrap gap-2">
          {paid.status !== "cancelling" && <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/billing/plans" />}>Change plan</Button>}
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
    </PlanCard>
  );
}
