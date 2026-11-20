"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { usePeople } from "@/hooks/queries/people";
import { orgTabFrom, orgTabUrl } from "./org-tabs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { GenerationsTable } from "@/components/admin/generations-table";
import { UsageTrendChart } from "@/components/admin/usage-trend-chart";
import { CreditBreakdownList } from "@/components/admin/credit-breakdown-list";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { TeamPeople } from "@/components/team/team-people";
import { AdminClientsTab } from "./admin-clients-tab";
import type { AgencyPerson, OpenInvite } from "@/lib/people/types";
import type { ClientBrief } from "@/lib/db/types";
import type { PersonExtra } from "@/components/team/person-entry-row";
import { ImpersonationAudit } from "@/components/admin/impersonation-audit/impersonation-audit";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type {
  OrgRow,
  CreditHistoryPoint,
  CreditBreakdownRow,
} from "@/lib/db/organizations";
import type { GenerationsPage } from "@/lib/db/generations";
import type { ImpersonationSessionPage } from "@/lib/db/impersonation-audit";
import type { OpenGrant } from "@/lib/billing/grants";
import type { BillingLogEntry } from "@/lib/db/billing-admin";
import type { LiveSubscription } from "@/lib/db/billing-subscriptions";
import { BillingTab } from "@/components/admin/billing/billing-tab";

const triggerClass =
  "flex-none px-0 py-0 font-display text-xl font-semibold tracking-tight text-foreground/40 data-active:text-foreground";

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
  people,
  invites,
  clients,
  generationCount,
  generationsPage,
  creditsUsedThisMonth,
  dailyHistory,
  monthlyHistory,
  yearlyHistory,
  breakdownByType,
  breakdownByModel,
  impersonationSessions,
  grants,
  billingLog,
  subscription,
}: {
  org: OrgRow;
  people: AgencyPerson[];
  invites: OpenInvite[];
  clients: ClientBrief[];
  generationCount: number;
  generationsPage: GenerationsPage;
  creditsUsedThisMonth: number;
  dailyHistory: CreditHistoryPoint[];
  monthlyHistory: CreditHistoryPoint[];
  yearlyHistory: CreditHistoryPoint[];
  breakdownByType: CreditBreakdownRow[];
  breakdownByModel: CreditBreakdownRow[];
  impersonationSessions: ImpersonationSessionPage;
  grants: OpenGrant[];
  billingLog: BillingLogEntry[];
  subscription: LiveSubscription | null;
}) {
  // The tab and the focused person live in the URL (Set permissions in the Clients tab links to
  // ?tab=people&person=). Switching tabs pushes the URL with the History API, which Next keeps in
  // step with useSearchParams without a server round trip or remounting the tabs.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tab = orgTabFrom(searchParams.get("tab"));
  const focusUserId = searchParams.get("person");
  // The same people resource the People and Clients tabs use, so the count follows their changes.
  const { data: team } = usePeople(org.id, { people, invites });

  // Admin's own action on every person, from the row's menu.
  const extras: PersonExtra[] = [
    {
      id: "reset_password",
      label: "Reset password",
      render: (p, dialog) => <ResetPasswordDialog orgId={org.id} userId={p.userId} displayName={p.name} {...dialog} />,
    },
  ];

  // Each tab switch is a history entry, so Back returns to the previous tab.
  function selectTab(next: unknown) {
    const nextTab = orgTabFrom(String(next));
    if (nextTab === tab) return;
    window.history.pushState(null, "", orgTabUrl(pathname, searchParams, { tab: nextTab }));
  }

  return (
    <Tabs value={tab} onValueChange={selectTab}>
      <TabsList variant="line" className="mb-8 h-auto w-auto gap-6 p-0">
        <TabsTrigger value="overview" className={triggerClass}>
          Overview
        </TabsTrigger>
        <TabsTrigger value="billing" className={triggerClass}>
          Billing
        </TabsTrigger>
        <TabsTrigger value="people" className={triggerClass}>
          People
        </TabsTrigger>
        <TabsTrigger value="clients" className={triggerClass}>
          Clients
        </TabsTrigger>
        <TabsTrigger value="generations" className={triggerClass}>
          Generations
        </TabsTrigger>
        <TabsTrigger value="support" className={triggerClass}>
          Support activity
        </TabsTrigger>
      </TabsList>

      {/* Overview: agency identity. Billing and the credit limit live in Billing; the roster in People. */}
      <TabsContent value="overview" className="animate-rise flex flex-col gap-8">
        <Card className="grid grid-cols-2 gap-6 p-6 shadow-card sm:grid-cols-3">
          <StatTile label="People" value={String((team ?? { people }).people.length)} />
          <StatTile label="Total generations" value={String(generationCount)} />
          <StatTile label="Created" value={formatRelativeTime(org.created_at)} />
        </Card>
      </TabsContent>

      <TabsContent value="billing" className="animate-rise">
        <BillingTab
          orgId={org.id}
          mode={org.billing_mode}
          planType={org.plan_type}
          monthlyLimit={org.monthly_credit_limit}
          grants={grants}
          log={billingLog}
          subscription={subscription}
        />
      </TabsContent>

      {/* People: the owner's Team page, with the owner's powers, plus Make owner and reset password. */}
      <TabsContent value="people" className="animate-rise">
        <TeamPeople
          orgId={org.id}
          clients={clients}
          initial={{ people, invites }}
          focusUserId={focusUserId}
          canMakeOwner
          extras={extras}
          // A client opens in this page's Clients tab, not the agency's own Members page.
          clientHref={(c) => `/admin/orgs/${org.id}?tab=clients&client=${c.id}`}
        />
      </TabsContent>

      <TabsContent value="clients" className="animate-rise">
        <AdminClientsTab orgId={org.id} clients={clients} initial={{ people, invites }} />
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

      {/* Support activity: what a support operator did while impersonating this org —
          a read-only audit trail, kept separate from the org's own usage data above. */}
      <TabsContent value="support" className="animate-rise flex flex-col gap-8">
        <ImpersonationAudit orgId={org.id} initial={impersonationSessions} />
      </TabsContent>
    </Tabs>
  );
}
