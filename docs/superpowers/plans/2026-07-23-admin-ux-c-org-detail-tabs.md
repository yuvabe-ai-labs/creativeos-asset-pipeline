# AX-C: Org Detail Page Tabs Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `/admin/orgs/[id]` from a flat Card stack into the same `Tabs` pattern
the clients page uses (Overview / Members / Generations / Settings), drop the slug display.

**Architecture:** A new `countGenerationsForOrg(orgId)` query (true count, not capped) backs
an Overview stat tile. A new client component `OrgDetailTabs` renders the four tabs; Overview
shows stat tiles, Members reuses the existing member list (restyled), Generations is a
dashed-border placeholder (AX-D fills it in), Settings reuses the existing
`CreditLimitEditor` unchanged inside a Card (AX-E will later swap it for an inline-edit
version — not this plan's job, so nothing regresses in the meantime). The page server
component (`page.tsx`) shrinks to fetching data and rendering `OrgDetailTabs`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn `Tabs`/`Card` (Base UI).

## Global Constraints

- Testing convention (index doc): this repo unit-tests pure logic only. `countGenerationsForOrg`
  is a thin Supabase query wrapper, the same category as the untested `listOrgsWithClientCount`/
  `listOrgMembers` already in `src/lib/db/organizations.ts` — no dedicated test file, consistent
  with that file's existing convention. The page/component changes get a build check + manual
  verification.
- Do **not** remove or change `CreditLimitEditor` (`src/app/admin/orgs/[id]/credit-limit-editor.tsx`)
  in this plan — reuse it as-is inside the new Settings tab. AX-E replaces it later.
- Slug (`org.slug`) must not appear anywhere on this page anymore.
- Tabs use `TabsList variant="line"` (shadcn Base UI, matching `src/components/clients/clients-home-tabs.tsx`'s
  pattern) — not the `default` boxed variant.
- No usage-vs-credit-limit math in the Overview tile (that's Stage 3 / credit-ledger scope,
  not this plan's).

---

### Task 1: `countGenerationsForOrg` query

**Files:**
- Modify: `src/lib/db/generations.ts`

**Interfaces:**
- Produces: `countGenerationsForOrg(orgId: string): Promise<number>`. Consumed by Task 2's
  Overview tab.

- [ ] **Step 1: Add the function**

In `src/lib/db/generations.ts`, add (after the existing `listGenerations` function, using
the same `createServerSupabase()` pattern every other function in this file uses):

```ts
export async function countGenerationsForOrg(orgId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { count, error } = await supabase
    .from("generations")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/generations.ts
git commit -m "feat(admin): add countGenerationsForOrg query"
```

---

### Task 2: `OrgDetailTabs` shell + wire into the page

**Files:**
- Create: `src/app/admin/orgs/[id]/org-detail-tabs.tsx`
- Modify: `src/app/admin/orgs/[id]/page.tsx`

**Interfaces:**
- Consumes: `countGenerationsForOrg` (Task 1), existing `getOrgById`/`listOrgMembers` from
  `src/lib/db/organizations.ts`, existing `CreditLimitEditor` from
  `./credit-limit-editor.tsx`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from
  `@/components/ui/tabs`, `Card` from `@/components/ui/card`.
- Produces: `OrgDetailTabs({ org, members, generationCount }: { org: OrgRow; members:
  { user_id: string; display_name: string; org_role: string }[]; generationCount: number })`.
  The Generations tab's placeholder and Settings tab's `CreditLimitEditor` slot are stable
  extension points — AX-D and AX-E replace their contents, not this component's props.

- [ ] **Step 1: Write `OrgDetailTabs`**

Create `src/app/admin/orgs/[id]/org-detail-tabs.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { CreditLimitEditor } from "./credit-limit-editor";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { OrgRow } from "@/lib/db/organizations";

const triggerClass =
  "flex-none px-0 py-0 font-display text-xl font-semibold tracking-tight text-foreground/40 data-active:text-foreground";

type Member = { user_id: string; display_name: string; org_role: string };

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-eyebrow text-muted-foreground/80">{label}</span>
      <span className="font-display text-2xl font-semibold tracking-tight">
        {value}
      </span>
    </div>
  );
}

export function OrgDetailTabs({
  org,
  members,
  generationCount,
}: {
  org: OrgRow;
  members: Member[];
  generationCount: number;
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
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
          <p className="font-display text-lg font-medium">Generations view coming soon</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This org's generation activity will show up here.
          </p>
        </Card>
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
```

- [ ] **Step 2: Rewrite the page**

Replace the full contents of `src/app/admin/orgs/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getOrgById, listOrgMembers } from "@/lib/db/organizations";
import { countGenerationsForOrg } from "@/lib/db/generations";
import { OrgDetailTabs } from "./org-detail-tabs";

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
  const [members, generationCount] = await Promise.all([
    listOrgMembers(id),
    countGenerationsForOrg(id),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">
        {org.name}
      </h1>
      <OrgDetailTabs org={org} members={members} generationCount={generationCount} />
    </main>
  );
}
```

- [ ] **Step 3: Verification**

Run: `npm run build`
Expected: builds successfully.

Manual check (staging): `/admin/orgs/[id]` shows four tabs, no slug anywhere, Overview's
stat tiles show real numbers, Members lists correctly, Generations shows the placeholder,
Settings still lets you edit and save the credit limit (unchanged behavior from before).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/orgs/[id]/org-detail-tabs.tsx src/app/admin/orgs/[id]/page.tsx
git commit -m "feat(admin): restructure org detail page with Tabs, drop slug"
```

---

## Self-Review Notes

- **Spec coverage:** spec §4 (Tabs shell, Overview, Members, slug removal). Generations
  (§5) and Settings' inline-edit (§6) are intentionally deferred to AX-D/AX-E — this task's
  placeholders are the documented extension points.
- **Type consistency:** `OrgRow`/member shape match `src/lib/db/organizations.ts` exactly,
  no renaming across Task 1/2.
- **No placeholders in the plan text itself:** the Generations tab's UI placeholder is a
  deliberate, spec'd interim state (not a plan placeholder) — it's real, complete code.
