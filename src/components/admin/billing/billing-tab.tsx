"use client";

import { Card } from "@/components/ui/card";
import { CreditLimitEditor } from "@/app/admin/orgs/[id]/credit-limit-editor";
import type { BillingMode, OpenGrant } from "@/lib/billing/grants";
import type { BillingLogEntry } from "@/lib/db/billing-admin";
import { BillingModeCard } from "./billing-mode-card";
import { GrantsCard } from "./grants-card";
import { BillingLogCard } from "./billing-log-card";

// The admin agency page's Billing tab (spec 2026-11-20-admin-agency-billing-design.md): how the
// agency is billed, its limit (managed) or credits (paying), and the log of every change.
export function BillingTab({
  orgId,
  mode,
  planType,
  monthlyLimit,
  grants,
  log,
}: {
  orgId: string;
  mode: BillingMode;
  planType: string;
  monthlyLimit: number | null;
  grants: OpenGrant[];
  log: BillingLogEntry[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <BillingModeCard orgId={orgId} mode={mode} planType={planType} />
      {mode === "managed" ? (
        <Card className="p-6 shadow-card">
          <h2 className="text-eyebrow mb-3">Monthly credit limit</h2>
          <CreditLimitEditor orgId={orgId} initial={monthlyLimit} />
        </Card>
      ) : (
        <GrantsCard orgId={orgId} grants={grants} />
      )}
      <BillingLogCard entries={log} />
    </div>
  );
}
