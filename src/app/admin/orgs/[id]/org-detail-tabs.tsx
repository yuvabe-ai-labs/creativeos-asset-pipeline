"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { CreditLimitEditor } from "./credit-limit-editor";
import { GenerationsTable } from "@/components/admin/generations-table";
import { UsageTrendChart } from "@/components/admin/usage-trend-chart";
import { CreditBreakdownList } from "@/components/admin/credit-breakdown-list";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type {
  OrgRow,
  CreditHistoryPoint,
  CreditBreakdownRow,
} from "@/lib/db/organizations";
import type { GenerationsPage } from "@/lib/db/generations";

const triggerClass =
  "flex-none px-0 py-0 font-display text-xl font-semibold tracking-tight text-foreground/40 data-active:text-foreground";

type Member = { user_id: string; display_name: string; org_role: string };

function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-eyebrow text-muted-foreground/80">{label}</span>
      <span className="font-display text-2xl font-semibold tracking-tight">
        {value}
      </span>
      {note && <span className="text-xs text-muted-foreground/70">{note}</span>}
    </div>
  );
}

export function OrgDetailTabs({
  org,
  members,
  generationCount,
  generationsPage,
  creditsUsedThisMonth,
  dailyHistory,
  monthlyHistory,
  yearlyHistory,
  breakdownByType,
  breakdownByModel,
}: {
  org: OrgRow;
  members: Member[];
  generationCount: number;
  generationsPage: GenerationsPage;
  creditsUsedThisMonth: number;
  dailyHistory: CreditHistoryPoint[];
  monthlyHistory: CreditHistoryPoint[];
  yearlyHistory: CreditHistoryPoint[];
  breakdownByType: CreditBreakdownRow[];
  breakdownByModel: CreditBreakdownRow[];
}) {
  const [tab, setTab] = useState("overview");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant="line" className="mb-8 h-auto w-auto gap-6 p-0">
        <TabsTrigger value="overview" className={triggerClass}>
          Overview
        </TabsTrigger>
        <TabsTrigger value="generations" className={triggerClass}>
          Generations
        </TabsTrigger>
      </TabsList>

      {/* Overview: agency identity, credit limit config, and the member roster — a
          handful of facts, consolidated from what used to be 3 separate thin tabs. */}
      <TabsContent value="overview" className="animate-rise flex flex-col gap-8">
        <Card className="grid grid-cols-2 gap-6 p-6 shadow-card sm:grid-cols-3">
          <StatTile label="Members" value={String(members.length)} />
          <StatTile label="Total generations" value={String(generationCount)} />
          <StatTile label="Created" value={formatRelativeTime(org.created_at)} />
        </Card>

        <Card className="p-6 shadow-card">
          <h2 className="text-eyebrow mb-3">Monthly credit limit</h2>
          <CreditLimitEditor orgId={org.id} initial={org.monthly_credit_limit} />
        </Card>

        <Card className="p-6 shadow-card">
          <h2 className="text-eyebrow mb-3">Members</h2>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between border-b py-2 text-sm last:border-b-0"
              >
                <span className="font-medium">{m.display_name}</span>
                <span className="text-muted-foreground">{m.org_role}</span>
              </li>
            ))}
          </ul>
        </Card>
      </TabsContent>

      {/* Generations: usage trend + breakdown, then the raw activity log — both are
          "what's been happening," grouped together rather than split across tabs. */}
      <TabsContent value="generations" className="animate-rise flex flex-col gap-8">
        <Card className="p-6 shadow-card">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-eyebrow">Usage this month</h2>
            <span className="font-display text-2xl font-semibold tracking-tight">
              {creditsUsedThisMonth.toLocaleString()} credits
            </span>
          </div>
          <UsageTrendChart daily={dailyHistory} monthly={monthlyHistory} yearly={yearlyHistory} />
        </Card>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card className="p-6 shadow-card">
            <CreditBreakdownList label="By type" rows={breakdownByType} />
          </Card>
          <Card className="p-6 shadow-card">
            <CreditBreakdownList label="By model" rows={breakdownByModel} />
          </Card>
        </div>

        <GenerationsTable orgId={org.id} initial={generationsPage} />
      </TabsContent>
    </Tabs>
  );
}
