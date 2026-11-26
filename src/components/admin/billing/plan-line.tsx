import { Badge } from "@/components/ui/badge";
import { formatRupees } from "@/lib/billing/pricing";
import { adminRenewalNote } from "@/lib/billing/plan-move-copy";
import { adminApprovalLine, adminNotApprovedLine } from "@/lib/billing/price-approval-copy";
import type { LiveSubscription } from "@/lib/db/billing-subscriptions";

const STATUS: Record<LiveSubscription["status"], { label: string; warn?: boolean }> = {
  created: { label: "Waiting for the first payment" },
  active: { label: "Active" },
  payment_due: { label: "Payment due", warn: true },
  cancelling: { label: "Cancelled" },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// A paying agency's plan on Admin's Billing card (D580): which plan, its state, and when it renews
// or ends, and what happens to its price then (D593). A due payment is the one state shown as a
// warning: AI runs are stopped. A new price the owner must approve says where that stands, and a
// plan that ended because it wasn't approved says so (D595).
export function PlanLine({ subscription, endedNotApproved = null }: { subscription: LiveSubscription | null; endedNotApproved?: { endsAt: string | null } | null }) {
  if (!subscription) {
    return (
      <div className="flex flex-col gap-1 p-6">
        <span className="text-eyebrow text-muted-foreground">Plan</span>
        <span className="text-sm text-muted-foreground">
          {endedNotApproved ? `${adminNotApprovedLine(endedNotApproved.endsAt)} ` : ""}No plan yet. The owner picks one in CreativeOS.
        </span>
      </div>
    );
  }
  const approval = subscription.approval;
  const status =
    approval && subscription.status === "cancelling"
      ? { label: approval.state === "asked" ? "Waiting for approval" : "New price approved" }
      : STATUS[subscription.status];
  const end = subscription.currentPeriodEnd ? day(subscription.currentPeriodEnd) : null;
  return (
    <div className="flex flex-col gap-1 p-6">
      <span className="text-eyebrow text-muted-foreground">Plan</span>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{subscription.planName ?? "Plan"}</span>
        {subscription.amountMinor !== null && <span className="text-muted-foreground">{formatRupees(subscription.amountMinor)} a month + GST</span>}
        <Badge variant={status.warn ? "destructive" : "outline"}>{status.label}</Badge>
      </span>
      {end && (
        <span className="text-xs text-muted-foreground">
          {subscription.status === "cancelling" ? `Ends ${end}` : subscription.status === "payment_due" ? `AI runs are stopped until the payment goes through` : `Renews ${end}`}
          {subscription.status === "active" && !approval ? adminRenewalNote(subscription.planName, subscription.next) : ""}
        </span>
      )}
      {approval && <span className="text-xs text-muted-foreground">{adminApprovalLine(approval)}</span>}
    </div>
  );
}
