"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { CreditLimitEditor } from "./credit-limit-editor";
import { GenerationsTable } from "@/components/admin/generations-table";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { OrgRow } from "@/lib/db/organizations";
import type { GenerationForOrgList } from "@/lib/db/generations";

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
  generations,
}: {
  org: OrgRow;
  members: Member[];
  generationCount: number;
  generations: GenerationForOrgList[];
}) {
  const [tab, setTab] = useState("overview");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant="line" className="mb-8 h-auto w-auto gap-6 p-0">
        <TabsTrigger value="overview" className={triggerClass}>
          Overview
        </TabsTrigger>
        <TabsTrigger value="members" className={triggerClass}>
          Members
        </TabsTrigger>
        <TabsTrigger value="generations" className={triggerClass}>
          Generations
        </TabsTrigger>
        <TabsTrigger value="settings" className={triggerClass}>
          Settings
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="animate-rise">
        <Card className="grid grid-cols-2 gap-6 p-6 shadow-card sm:grid-cols-4">
          <StatTile label="Members" value={String(members.length)} />
          <StatTile label="Total generations" value={String(generationCount)} />
          <StatTile
            label="Monthly credit limit"
            value={
              org.monthly_credit_limit === null
                ? "Unlimited"
                : String(org.monthly_credit_limit)
            }
            note="Edit in Settings"
          />
          <StatTile label="Created" value={formatRelativeTime(org.created_at)} />
        </Card>
      </TabsContent>

      <TabsContent value="members" className="animate-rise">
        <Card className="p-6 shadow-card">
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

      <TabsContent value="generations" className="animate-rise">
        <GenerationsTable generations={generations} />
      </TabsContent>

      <TabsContent value="settings" className="animate-rise">
        <Card className="p-6 shadow-card">
          <h2 className="text-eyebrow mb-3">Monthly credit limit</h2>
          <CreditLimitEditor orgId={org.id} initial={org.monthly_credit_limit} />
        </Card>
      </TabsContent>
    </Tabs>
  );
}
