"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BillingMode } from "@/lib/billing/grants";
import { CreditLimitField } from "@/components/admin/credit-limit-field";
import { BILLING_MODE_OPTIONS } from "./billing-labels";
import { SegmentedChoice } from "./segmented-choice";
import { FreeCreditsField } from "./free-credits-field";

// Add an agency's Billing, sent as `billingMode`. Managed (the default, as every agency is today)
// keeps the monthly credit limit; paying for a plan can start with free credits instead.
export function BillingModeField() {
  const [mode, setMode] = useState<BillingMode>("managed");
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label>Billing</Label>
        <SegmentedChoice value={mode} options={BILLING_MODE_OPTIONS} onChange={setMode} />
        <p className="text-xs text-muted-foreground">
          {mode === "plans" ? "The owner picks a plan and pays every month." : "Yuvabe pays. The agency is never charged."}
        </p>
        <Input type="hidden" name="billingMode" value={mode} />
      </div>
      {mode === "plans" ? <FreeCreditsField /> : <CreditLimitField />}
    </>
  );
}
