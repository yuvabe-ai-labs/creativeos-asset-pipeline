"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OpenGrant } from "@/lib/billing/grants";
import { CreditGrantList } from "@/components/billing/credit-grant-list";
import { GrantDialog } from "./grant-dialog";
import { TakeBackDialog } from "./take-back-dialog";
import { GrantEndDialog } from "./grant-end-dialog";

const addChip = "border border-dashed border-primary/40 hover:bg-primary/5";
const n = (v: number) => v.toLocaleString("en-IN");

// A paying agency's open credits, the one ending first at the top (spec §3). The body of the
// Billing card for a paying agency.
export function GrantsPanel({ orgId, grants }: { orgId: string; grants: OpenGrant[] }) {
  const left = grants.reduce((sum, g) => sum + g.left, 0);
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-eyebrow text-muted-foreground">Credits</span>
          <span className="font-display text-xl font-semibold tracking-tight">{n(left)} left</span>
        </div>
        <div className="flex gap-2">
          <GrantDialog orgId={orgId} kind="admin" trigger={<Button variant="ghost" size="sm" className={addChip}><Plus className="size-4" strokeWidth={1.5} />Add credits</Button>} />
          <GrantDialog orgId={orgId} kind="free" trigger={<Button variant="ghost" size="sm" className={addChip}><Plus className="size-4" strokeWidth={1.5} />Give free credits</Button>} />
        </div>
      </div>
      <CreditGrantList
        grants={grants}
        empty="No credits. AI runs are stopped until credits are added or a plan is bought."
        actions={(g) => (
          <>
            <TakeBackDialog orgId={orgId} grant={g} trigger={<Button variant="ghost" size="sm" disabled={g.left <= 0}>Take back</Button>} />
            <GrantEndDialog orgId={orgId} grant={g} trigger={<Button variant="ghost" size="sm">Change end date</Button>} />
          </>
        )}
      />
    </div>
  );
}
