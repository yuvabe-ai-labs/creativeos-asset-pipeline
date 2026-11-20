"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDay, lastDayOf } from "@/lib/billing/dates";
import type { OpenGrant } from "@/lib/billing/grants";
import { GRANT_KIND_LABEL } from "./billing-labels";
import { GrantDialog } from "./grant-dialog";
import { TakeBackDialog } from "./take-back-dialog";
import { GrantEndDialog } from "./grant-end-dialog";

const addChip = "border border-dashed border-primary/40 hover:bg-primary/5";
const n = (v: number) => v.toLocaleString("en-US");

// A paying agency's open credits, the one ending first at the top (spec §3).
export function GrantsCard({ orgId, grants }: { orgId: string; grants: OpenGrant[] }) {
  const left = grants.reduce((sum, g) => sum + g.left, 0);
  return (
    <Card className="flex flex-col gap-4 p-6 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-eyebrow">Credits</h2>
          <span className="font-display text-xl font-semibold tracking-tight">{n(left)} left</span>
        </div>
        <div className="flex gap-2">
          <GrantDialog orgId={orgId} kind="admin" trigger={<Button variant="ghost" size="sm" className={addChip}><Plus className="size-4" strokeWidth={1.5} />Add credits</Button>} />
          <GrantDialog orgId={orgId} kind="free" trigger={<Button variant="ghost" size="sm" className={addChip}><Plus className="size-4" strokeWidth={1.5} />Give free credits</Button>} />
        </div>
      </div>
      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No credits. AI runs are stopped until credits are added or a plan is bought.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {grants.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{GRANT_KIND_LABEL[g.kind]}</span>
                <span className="text-xs text-muted-foreground">
                  {n(g.left)} of {n(g.credits)} left · until {formatDay(lastDayOf(g.endsAt))}
                </span>
              </div>
              <div className="flex gap-1">
                <TakeBackDialog orgId={orgId} grant={g} trigger={<Button variant="ghost" size="sm" disabled={g.left <= 0}>Take back</Button>} />
                <GrantEndDialog orgId={orgId} grant={g} trigger={<Button variant="ghost" size="sm">Change end date</Button>} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {grants.length > 0 && <p className="text-xs text-muted-foreground">Credits that end first are used first.</p>}
    </Card>
  );
}
