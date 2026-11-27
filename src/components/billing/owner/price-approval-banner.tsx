"use client";

import { Button } from "@/components/ui/button";
import { useBillingCheckout } from "@/hooks/use-billing-checkout";
import { approvalAskText, approvalCheckText, approvedText, type PriceApproval } from "@/lib/billing/price-approval-copy";
import { BillingNotice } from "./billing-notice";
import { CheckoutStatusLine } from "./checkout-status-line";

// The owner's Usage page, at the top, while a new price waits for their approval or once approved
// (D595). Their way of paying can't move to a new price by itself: they approve it, or the plan ends
// on the date shown. The page is the owner's only, so this is too.
export function PriceApprovalBanner({ approval }: { approval: PriceApproval }) {
  const { approvePrice, busy, status } = useBillingCheckout();
  // Approved just now: the webhook records it a moment later and the page then reads it.
  const approvedHere = status?.tone === "ok";

  if (approval.state === "approved" || approvedHere) {
    const startsAt = approval.state === "approved" ? approval.startsAt : approval.endsAt;
    return <BillingNotice tone="ok" title={approvedText({ amountMinor: approval.amountMinor, startsAt })} />;
  }

  return (
    <BillingNotice
      tone="warn"
      title={approvalAskText(approval)}
      action={
        <Button disabled={busy} onClick={() => approvePrice(approval.amountMinor)}>
          {busy ? "Opening…" : "Approve new price"}
        </Button>
      }
    >
      {approvalCheckText(approval)}
      <CheckoutStatusLine status={status} />
    </BillingNotice>
  );
}
