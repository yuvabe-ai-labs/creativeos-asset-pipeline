"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setBillingModeAction } from "@/lib/actions/billing-admin";
import type { BillingMode } from "@/lib/billing/grants";
import { BILLING_MODE_LABEL } from "./billing-labels";
import { BillingChangeDialog } from "./billing-change-dialog";

const WHAT_HAPPENS: Record<BillingMode, string> = {
  managed: "Their credits stop counting and the monthly credit limit applies. The agency is never charged.",
  plans: "AI runs need credits from now: free credits, or a plan once plans are on.",
};

const SUMMARY: Record<BillingMode, string> = {
  managed: "Yuvabe pays. The agency is never charged.",
  plans: "The owner pays for a plan. AI runs use its credits.",
};

// How the agency is billed, and Change: the top of the Billing card (spec §1). Plan type shows
// only when it is not the standard one.
export function BillingModeHeader({ orgId, mode, planType }: { orgId: string; mode: BillingMode; planType: string }) {
  const next: BillingMode = mode === "plans" ? "managed" : "plans";
  return (
    <div className="flex items-start justify-between gap-6 p-6">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
          {BILLING_MODE_LABEL[mode]}
          {planType === "custom" && <Badge variant="outline">Custom plan</Badge>}
        </span>
        <span className="text-sm text-muted-foreground">{SUMMARY[mode]}</span>
      </div>
      <BillingChangeDialog
        trigger={<Button variant="outline" size="sm">Change</Button>}
        title={`Change to ${BILLING_MODE_LABEL[next]}`}
        description={WHAT_HAPPENS[next]}
        saveLabel="Change billing"
        onSubmit={(reason) => setBillingModeAction(orgId, next, reason)}
      />
    </div>
  );
}

