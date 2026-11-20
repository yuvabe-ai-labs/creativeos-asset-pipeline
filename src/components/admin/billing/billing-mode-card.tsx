"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { setBillingModeAction } from "@/lib/actions/billing-admin";
import type { BillingMode } from "@/lib/billing/grants";
import { BILLING_MODE_LABEL } from "./billing-labels";
import { BillingChangeDialog } from "./billing-change-dialog";

const WHAT_HAPPENS: Record<BillingMode, string> = {
  managed: "Their credits stop counting and the monthly credit limit applies. The agency is never charged.",
  plans: "AI runs need credits from now: free credits, or a plan once plans are on.",
};

// How the agency is billed, and Change (spec 2026-11-20-admin-agency-billing-design.md §1).
export function BillingModeCard({ orgId, mode, planType }: { orgId: string; mode: BillingMode; planType: string }) {
  const next: BillingMode = mode === "plans" ? "managed" : "plans";
  return (
    <Card className="flex flex-row items-start justify-between gap-6 p-6 shadow-card">
      <div className="flex flex-col gap-1">
        <h2 className="text-eyebrow">Billing</h2>
        <span className="font-display text-xl font-semibold tracking-tight">{BILLING_MODE_LABEL[mode]}</span>
        <span className="text-sm text-muted-foreground">Plan type: {planType === "custom" ? "Custom" : "Standard"}</span>
      </div>
      <BillingChangeDialog
        trigger={<Button variant="outline" size="sm">Change</Button>}
        title={`Change to ${BILLING_MODE_LABEL[next]}`}
        description={WHAT_HAPPENS[next]}
        saveLabel="Change billing"
        onSubmit={(reason) => setBillingModeAction(orgId, next, reason)}
      />
    </Card>
  );
}

