# Credit System 3F — Admin Agency Usage UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin agency-detail page (`/admin/orgs/[id]`) a real usage picture — month-
over-month trend, a breakdown by generation type and by model — and stop pretending 4 tabs is
the right shape when 3 of them barely have content. Consolidate into 2 tabs sized to what's
actually there: **Overview** (agency identity, credit limit, members — a handful of facts,
none of which alone justified its own tab) and **Generations** (the one section with real,
deep, ongoing content — now also carrying the usage trend/breakdown, since both are "what's
been happening" data).

**Architecture:** Three new Postgres functions (parameterized, so plain views can't do the
job — `org_monthly_credit_history`, `org_credit_breakdown_by_type`,
`org_credit_breakdown_by_model`) extend the `credit_transactions` ledger that
`org_credit_usage` (3A) already reads, the same "sum over a window" idea generalized to a
rolling 6-month window and to breakdowns joined against `generations` for `type`/
`model_used`. A new `recharts` dependency (no charting library existed in this project before
— confirmed) renders the trend as a bar chart; a small reusable list component renders each
breakdown. `OrgDetailTabs` goes from 4 tabs to 2, with the existing, already-good
`CreditLimitEditor` and members list simply relocated, not rebuilt.

**Tech Stack:** Supabase Postgres (parameterized SQL functions via `supabase.rpc()`), React
server components (the existing `page.tsx` data-fetching shape), `recharts` (new dependency).

## Global Constraints

- **This redesign happened through extensive back-and-forth with the user, not a single
  spec — the decisions below are final, not starting points to re-litigate:**
  - 2 tabs, not 4: **Overview** (agency identity + credit limit + members) and
    **Generations** (usage trend + breakdown + the existing generation log).
  - Tabs, not a sidebar — confirmed explicitly: a sidebar earns its keep with many
    destinations (the research's Linear example was a whole settings app); 2 sections don't
    justify one.
  - `recharts` for the trend chart — confirmed explicitly, over a hand-built chart or a
    table-only first pass.
  - Breakdown dimensions: by month (trend), by generation type, by model. **Not** a
    per-client breakdown or drill-down — that was a real misunderstanding mid-conversation,
    corrected by the user ("its per agency," not per-client-within-an-org). This plan does
    not touch client-level views at all.
  - No month-selector/picker in this first pass — the breakdown shows the **current** month
    only, alongside the 6-month trend chart for context. A selector to view an arbitrary past
    month's breakdown is a reasonable later addition, not built here (scope discipline: it
    wasn't explicitly requested, only inferred from research as a common pattern).
- **Every terminal generation nets out correctly in ANY closed month's sum** — same property
  `org_credit_usage` already relies on for the current month (design spec §4): a plain
  `sum(amount)` over `credit_transactions` is correct because every generation's reservation
  is always eventually cancelled by exactly one refund or matched by one consumption. The new
  monthly-history and breakdown functions rely on the identical property, just windowed
  differently. The one accepted caveat (also already established elsewhere in this design):
  a generation still `running` when the CURRENT month's breakdown is queried has an
  outstanding, not-yet-terminal reservation, so the current month's live figures can be
  transiently a little off until it resolves — self-corrects, not engineered around.
- The existing `CreditLimitEditor` and the members `<ul>` are **relocated, not rebuilt** —
  both already work; this plan moves where they render, not what they do.
- No automated tests (matches this repo's convention for server components, DB helpers, and
  presentational chart/list components). Verified by `npm run build` + `npx tsc --noEmit` +
  manual staging verification (listed at the end).

---

### Task 1: Three Postgres functions for monthly history + breakdowns

**Files:**
- Create: `supabase/migrations/0023_org_credit_breakdowns.sql`

**Interfaces:**
- Produces: `org_monthly_credit_history(p_org_id uuid, p_months int default 6) returns table
  (month timestamptz, credits_used numeric)`, `org_credit_breakdown_by_type(p_org_id uuid,
  p_month_start timestamptz, p_month_end timestamptz) returns table(type text, credits
  numeric)`, `org_credit_breakdown_by_model(p_org_id uuid, p_month_start timestamptz,
  p_month_end timestamptz) returns table(model text, credits numeric)` — the exact RPC names
  and parameter names Task 2's TS wrappers call.

- [ ] **Step 1: Write the migration file**

```sql
-- Stage 3 (Credit System) admin usage breakdown functions, sub-plan 3F. See
-- docs/superpowers/specs/2026-07-26-admin-usage-dashboard-research.md for the SaaS patterns
-- this is based on (Anthropic Console's daily/monthly cost views, Vercel's usage-by-category
-- breakdown). Parameterized queries — a plain view (like org_credit_usage, migration 0019)
-- can't take arguments, so these are SQL functions instead.
--
-- Relies on the same "plain sum is correct" property org_credit_usage already does (design
-- spec §4): every generation's reservation is always eventually cancelled by exactly one
-- refund or matched by one consumption, so summing every row in a CLOSED month nets to the
-- real total. The current (still-open) month can be transiently off for any generation still
-- `running` — accepted, same as everywhere else this property is relied on.

-- Last N months' totals (default 6), oldest first — for the trend chart. UTC month
-- boundaries, matching org_credit_usage's own convention.
create or replace function org_monthly_credit_history(p_org_id uuid, p_months int default 6)
returns table(month timestamptz, credits_used numeric)
language sql stable
as $$
  select date_trunc('month', created_at at time zone 'utc') at time zone 'utc' as month,
         sum(amount) as credits_used
  from credit_transactions
  where org_id = p_org_id
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
                       - make_interval(months => p_months - 1)
  group by month
  order by month asc
$$;

-- Credits used by generation type (image/video/prompt), for one specific month window.
-- Joins to generations for `type` — credit_transactions itself has no notion of generation
-- type, only generation_id.
create or replace function org_credit_breakdown_by_type(
  p_org_id uuid,
  p_month_start timestamptz,
  p_month_end timestamptz
)
returns table(type text, credits numeric)
language sql stable
as $$
  select g.type, sum(t.amount) as credits
  from credit_transactions t
  join generations g on g.id = t.generation_id
  where t.org_id = p_org_id
    and t.created_at >= p_month_start
    and t.created_at < p_month_end
  group by g.type
  order by credits desc
$$;

-- Credits used by model (e.g. "openai:gpt-image-2"), for one specific month window.
create or replace function org_credit_breakdown_by_model(
  p_org_id uuid,
  p_month_start timestamptz,
  p_month_end timestamptz
)
returns table(model text, credits numeric)
language sql stable
as $$
  select g.model_used as model, sum(t.amount) as credits
  from credit_transactions t
  join generations g on g.id = t.generation_id
  where t.org_id = p_org_id
    and t.created_at >= p_month_start
    and t.created_at < p_month_end
  group by g.model_used
  order by credits desc
$$;
```

- [ ] **Step 2: Apply the migration**

Run the full contents of `0023_org_credit_breakdowns.sql` in the Supabase dashboard SQL
editor. Expected: no errors.

- [ ] **Step 3: Verify with read-only queries**

Run: `select proname from pg_proc where proname like 'org_%credit%' order by proname;`
Expected: 4 rows — `org_credit_breakdown_by_model`, `org_credit_breakdown_by_type`,
`org_credit_usage` (a view, not a function — will still list here since `pg_proc` only
covers the 3 new functions, so expect exactly 3 rows: `org_credit_breakdown_by_model`,
`org_credit_breakdown_by_type`, `org_monthly_credit_history`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0023_org_credit_breakdowns.sql
git commit -m "feat(db): add monthly credit history + type/model breakdown functions"
```

---

### Task 2: DB helpers wrapping the 3 new functions

**Files:**
- Modify: `src/lib/db/organizations.ts`

**Interfaces:**
- Produces: `getOrgMonthlyCreditHistory(orgId: string, months?: number): Promise<{ month:
  string; creditsUsed: number }[]>`, `getOrgCreditBreakdownByType(orgId: string, monthStart:
  string, monthEnd: string): Promise<{ key: string; credits: number }[]>`,
  `getOrgCreditBreakdownByModel(orgId: string, monthStart: string, monthEnd: string):
  Promise<{ key: string; credits: number }[]>` — the exact names Task 4's `page.tsx` rewire
  imports.

No test (I/O-bound DB helpers — matches this repo's convention). Verified by `npm run build`
+ `npx tsc --noEmit`.

- [ ] **Step 1: Add the three helpers**

In `src/lib/db/organizations.ts`, add after `getOrgCreditUsage`:

```ts
export type MonthlyCreditPoint = { month: string; creditsUsed: number };

// Last N months' totals (default 6), oldest first — for the Generations tab's trend chart.
export async function getOrgMonthlyCreditHistory(
  orgId: string,
  months = 6,
): Promise<MonthlyCreditPoint[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_monthly_credit_history", {
    p_org_id: orgId,
    p_months: months,
  });
  if (error) throw error;
  return ((data ?? []) as { month: string; credits_used: number }[]).map((row) => ({
    month: row.month,
    creditsUsed: row.credits_used,
  }));
}

export type CreditBreakdownRow = { key: string; credits: number };

// Credits used by generation type (image/video/prompt) for one month window.
export async function getOrgCreditBreakdownByType(
  orgId: string,
  monthStart: string,
  monthEnd: string,
): Promise<CreditBreakdownRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_credit_breakdown_by_type", {
    p_org_id: orgId,
    p_month_start: monthStart,
    p_month_end: monthEnd,
  });
  if (error) throw error;
  return ((data ?? []) as { type: string; credits: number }[]).map((row) => ({
    key: row.type,
    credits: row.credits,
  }));
}

// Credits used by model for one month window. model_used can be null on an old/pre-model
// row — labeled "Unknown" rather than dropped, so the breakdown's total still reconciles
// with the month's real total.
export async function getOrgCreditBreakdownByModel(
  orgId: string,
  monthStart: string,
  monthEnd: string,
): Promise<CreditBreakdownRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_credit_breakdown_by_model", {
    p_org_id: orgId,
    p_month_start: monthStart,
    p_month_end: monthEnd,
  });
  if (error) throw error;
  return ((data ?? []) as { model: string | null; credits: number }[]).map((row) => ({
    key: row.model ?? "Unknown",
    credits: row.credits,
  }));
}
```

- [ ] **Step 2: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/organizations.ts
git commit -m "feat(credits): add DB helpers for monthly history + type/model breakdowns"
```

---

### Task 3: `recharts` dependency + `UsageTrendChart` + `CreditBreakdownList` components

**Files:**
- Modify: `package.json` (new dependency)
- Create: `src/components/admin/usage-trend-chart.tsx`
- Create: `src/components/admin/credit-breakdown-list.tsx`

**Interfaces:**
- Produces: `<UsageTrendChart data={MonthlyCreditPoint[]} />`,
  `<CreditBreakdownList label={string} rows={CreditBreakdownRow[]} />` — both exact names/
  props Task 4's `OrgDetailTabs` rewrite imports and renders.

No test (presentational client components — matches this repo's convention). Verified by
`npm run build` + `npx tsc --noEmit`.

- [ ] **Step 1: Install recharts**

Run: `npm install recharts@^3.10.1`
Expected: `package.json`/`package-lock.json` gain the new dependency, no install errors.

- [ ] **Step 2: Write `UsageTrendChart`**

```tsx
// src/components/admin/usage-trend-chart.tsx
"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyCreditPoint } from "@/lib/db/organizations";

// 6-month credit-usage trend for the admin Generations tab. Neutral bars, current month
// highlighted in the brand purple (used sparingly, per the design system) — the one accent
// on an otherwise quiet chart. No springs/bounce (design system rule) — recharts' default
// transitions are simple opacity/height tweens, not spring physics, so no easing override
// is needed here.
export function UsageTrendChart({ data }: { data: MonthlyCreditPoint[] }) {
  const chartData = data.map((point, i) => ({
    label: new Date(point.month).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    }),
    credits: point.creditsUsed,
    isCurrent: i === data.length - 1,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
            formatter={(value: number) => [`${value.toLocaleString()} credits`, "Used"]}
          />
          <Bar dataKey="credits" radius={[4, 4, 0, 0]}>
            {chartData.map((point) => (
              <Cell
                key={point.label}
                fill={point.isCurrent ? "var(--primary)" : "var(--muted-foreground)"}
                fillOpacity={point.isCurrent ? 1 : 0.25}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Write `CreditBreakdownList`**

```tsx
// src/components/admin/credit-breakdown-list.tsx
import type { CreditBreakdownRow } from "@/lib/db/organizations";

// Renders one breakdown dimension (by generation type, or by model) as a simple ranked list
// with a lightweight proportional bar per row — reused for both dimensions in the
// Generations tab, same component, different data.
export function CreditBreakdownList({
  label,
  rows,
}: {
  label: string;
  rows: CreditBreakdownRow[];
}) {
  const total = rows.reduce((sum, r) => sum + r.credits, 0);

  return (
    <div>
      <span className="text-eyebrow text-muted-foreground/80">{label}</span>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No usage this month.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((row) => {
            const pct = total > 0 ? (row.credits / total) * 100 : 0;
            return (
              <li key={row.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize text-foreground">{row.key}</span>
                  <span className="text-muted-foreground">
                    {row.credits.toLocaleString()} credits
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/admin/usage-trend-chart.tsx src/components/admin/credit-breakdown-list.tsx
git commit -m "feat(admin): add recharts, UsageTrendChart, CreditBreakdownList components"
```

---

### Task 4: Consolidate `OrgDetailTabs` from 4 tabs to 2, wire the new usage data in

**Files:**
- Modify: `src/app/admin/orgs/[id]/page.tsx`
- Modify: `src/app/admin/orgs/[id]/org-detail-tabs.tsx`

**Interfaces:**
- Consumes: `getOrgMonthlyCreditHistory`, `getOrgCreditBreakdownByType`,
  `getOrgCreditBreakdownByModel`, `getOrgCreditUsage` (Task 2 + existing 3A helper),
  `UsageTrendChart`, `CreditBreakdownList` (Task 3), the existing `CreditLimitEditor` and
  `GenerationsTable` (relocated, unchanged).

No test (server component + client component — matches this repo's convention). Verified by
`npm run build` + `npx tsc --noEmit`, plus manual staging verification (listed at the end).

- [ ] **Step 1: Fetch the new data in `page.tsx`**

Replace the full contents of `src/app/admin/orgs/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  getOrgById,
  listOrgMembers,
  getOrgCreditUsage,
  getOrgMonthlyCreditHistory,
  getOrgCreditBreakdownByType,
  getOrgCreditBreakdownByModel,
} from "@/lib/db/organizations";
import { countGenerationsForOrg, listGenerationsForOrg } from "@/lib/db/generations";
import { OrgDetailTabs } from "./org-detail-tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const org = await getOrgById(id);
  if (!org) notFound();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const [
    members,
    generationCount,
    generations,
    creditsUsedThisMonth,
    monthlyHistory,
    breakdownByType,
    breakdownByModel,
  ] = await Promise.all([
    listOrgMembers(id),
    countGenerationsForOrg(id),
    listGenerationsForOrg(id),
    getOrgCreditUsage(id),
    getOrgMonthlyCreditHistory(id),
    getOrgCreditBreakdownByType(id, monthStart, monthEnd),
    getOrgCreditBreakdownByModel(id, monthStart, monthEnd),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin">Agencies</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{org.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">
        {org.name}
      </h1>
      <OrgDetailTabs
        org={org}
        members={members}
        generationCount={generationCount}
        generations={generations}
        creditsUsedThisMonth={creditsUsedThisMonth}
        monthlyHistory={monthlyHistory}
        breakdownByType={breakdownByType}
        breakdownByModel={breakdownByModel}
      />
    </main>
  );
}
```

- [ ] **Step 2: Rewrite `OrgDetailTabs` to 2 consolidated tabs**

Replace the full contents of `src/app/admin/orgs/[id]/org-detail-tabs.tsx`:

```tsx
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
  MonthlyCreditPoint,
  CreditBreakdownRow,
} from "@/lib/db/organizations";
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
  creditsUsedThisMonth,
  monthlyHistory,
  breakdownByType,
  breakdownByModel,
}: {
  org: OrgRow;
  members: Member[];
  generationCount: number;
  generations: GenerationForOrgList[];
  creditsUsedThisMonth: number;
  monthlyHistory: MonthlyCreditPoint[];
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
          <UsageTrendChart data={monthlyHistory} />
        </Card>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card className="p-6 shadow-card">
            <CreditBreakdownList label="By type" rows={breakdownByType} />
          </Card>
          <Card className="p-6 shadow-card">
            <CreditBreakdownList label="By model" rows={breakdownByModel} />
          </Card>
        </div>

        <GenerationsTable generations={generations} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 3: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/orgs/\[id\]/page.tsx src/app/admin/orgs/\[id\]/org-detail-tabs.tsx
git commit -m "feat(admin): consolidate org-detail page to 2 tabs, add usage trend + breakdown"
```

---

## Self-Review

**1. Spec coverage.** Every decision reached during this session's extended back-and-forth is
implemented: 2 tabs not 4 (Task 4), tabs not sidebar (Task 4's structure), recharts for the
chart (Task 3), breakdown by month/type/model at the agency level only, no client drill-down
(Tasks 1-4 throughout — nothing here touches `client_id`), no month-selector in this pass
(Task 4 hardcodes "current month" for the breakdown, matching the explicit scope decision).
`CreditLimitEditor` and the members list are relocated verbatim, not rebuilt (Task 4, Step 2).

**2. Placeholder scan.** No TBD/TODO. Every task's code is exact and complete.

**3. Type consistency.** `MonthlyCreditPoint`/`CreditBreakdownRow` (Task 2) are used with
identical shapes in `UsageTrendChart`/`CreditBreakdownList`'s props (Task 3) and
`OrgDetailTabs`'s new props (Task 4). The 3 RPC names/parameter names in the migration (Task
1) match exactly what Task 2's `supabase.rpc(...)` calls use.

No gaps found.

---

## Manual staging verification checklist (no browser access in this environment)

- [ ] `/admin/orgs/[id]` shows exactly 2 tabs: Overview, Generations
- [ ] Overview shows member count/total generations/created date, the credit-limit editor
      (still fully functional — Unlimited/Set toggle, Save/Cancel), and the member list
- [ ] Generations shows this month's total, a 6-month bar chart (current month highlighted),
      breakdown-by-type and breakdown-by-model lists, then the existing generations table
      below, all in that order
- [ ] An agency with zero usage this month shows "No usage this month." in both breakdown
      lists, not an error or an empty crash
- [ ] The chart and breakdown numbers are internally consistent (the latest bar in the trend
      chart matches "Usage this month," and summing the by-type breakdown's credits roughly
      matches that same total, modulo any generation still `running`)

---

Plan complete and saved to `docs/superpowers/plans/2026-07-24-credit-system-3f-admin-usage-ux.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
