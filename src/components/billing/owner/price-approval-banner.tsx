"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillingCheckout } from "@/hooks/use-billing-checkout";
import { approvalAskText, approvalCheckText, approvedText, type PriceApproval } from "@/lib/billing/price-approval-copy";
import { CheckoutStatusLine } from "./checkout-status-line";

// The owner's Billing, above the plan, while a new price waits for their approval or once approved
// (D595). Their way of paying can't move to a new price by itself: they approve it, or the plan ends
// on the date shown. The page is the owner's only, so this is too.
export function PriceApprovalBanner({ approval }: { approval: PriceApproval }) {
  const { approvePrice, busy, status } = useBillingCheckout();
  // Approved just now: the webhook records it a moment later and the page then reads it.
  const approvedHere = status?.tone === "ok";

  if (approval.state === "approved" || approvedHere) {
    const startsAt = approval.state === "approved" ? approval.startsAt : approval.endsAt;
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-5 text-sm shadow-card" role="status">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
        <span>{approvedText({ amountMinor: approval.amountMinor, startsAt })}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start gap-2 text-sm font-medium">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" strokeWidth={1.5} aria-hidden />
          {approvalAskText(approval)}
        </span>
        <span className="text-sm text-muted-foreground">{approvalCheckText(approval)}</span>
        <CheckoutStatusLine status={status} />
      </div>
      <Button disabled={busy} onClick={() => approvePrice(approval.amountMinor)}>
        {busy ? "Opening…" : "Approve new price"}
      </Button>
    </div>
  );
}
