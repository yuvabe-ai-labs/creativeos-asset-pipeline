"use client";

import { Card } from "@/components/ui/card";
import { CreditLimitEditor } from "@/app/admin/orgs/[id]/credit-limit-editor";
import type { BillingMode, OpenGrant } from "@/lib/billing/grants";
import type { BillingLogEntry, BillingLogPage } from "@/lib/db/billing-admin";
import type { LiveSubscription } from "@/lib/db/billing-subscriptions";
import { PlanLine } from "./plan-line";
import { BillingModeHeader } from "./billing-mode-card";
import { GrantsPanel } from "./grants-card";
import { BillingLog } from "./billing-log-card";

/** The plan ended because its new price wasn't approved (D595): the newest price entry says so. */
function endedNotApproved(entries: BillingLogEntry[]): { endsAt: string | null } | null {
  const last = entries.find((e) => e.action === "price_not_approved" || e.action === "price_approved" || e.action === "plan_move");
  if (last?.action !== "price_not_approved") return null;
  return { endsAt: typeof last.after?.ends_at === "string" ? last.after.ends_at : null };
}

// The admin agency page's Billing tab (spec 2026-11-20-admin-agency-billing-design.md): how the
// agency is billed, its limit (managed) or credits (paying), and the log of every change.
export function BillingTab({
  orgId,
  mode,
  planType,
  monthlyLimit,
  grants,
  log,
  subscription = null,
}: {
  orgId: string;
  mode: BillingMode;
  planType: string;
  monthlyLimit: number | null;
  grants: OpenGrant[];
  log: BillingLogPage;
  subscription?: LiveSubscription | null;
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* One card: how the agency is billed, then its limit (managed) or its credits (paying). */}
      <Card className="gap-0 divide-y divide-border py-0 shadow-card">
        <BillingModeHeader orgId={orgId} mode={mode} planType={planType} />
        {mode === "managed" ? (
          <div className="flex flex-col gap-3 p-6">
            <span className="text-eyebrow text-muted-foreground">Monthly credit limit</span>
            <CreditLimitEditor orgId={orgId} initial={monthlyLimit} />
          </div>
        ) : (
          <>
            <PlanLine subscription={subscription} endedNotApproved={subscription ? null : endedNotApproved(log.entries)} />
            <GrantsPanel orgId={orgId} grants={grants} hasPaidPlan={!!subscription && subscription.status !== "created"} />
          </>
        )}
      </Card>
      <BillingLog orgId={orgId} initial={log} />
    </div>
  );
}
