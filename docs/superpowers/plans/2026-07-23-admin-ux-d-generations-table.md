# AX-D: Generations Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "coming soon" placeholder in the org detail page's Generations tab
(AX-C) with a real table of the org's generations, client-side paginated.

**Architecture:** `listGenerationsForOrg(orgId, limit=100)` (single query, `clients(name)`
embedded via the nullable `client_id` column) backs a new `GenerationsTable` component that
follows the existing `RecentCanvasesTable` shape — `ListToolbar` + table — plus a new shadcn
`Pagination` primitive (25 rows/page) and a `GenerationStatusBadge` (same visual pattern as
`KBStatusBadge`). `OrgDetailTabs` (from AX-C) and `page.tsx` are updated to fetch and pass
the data through.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn `Button`/`Card` (Base UI), Lucide icons.

## Global Constraints

- Testing convention: pure logic only gets unit tests. `listGenerationsForOrg` is a Supabase
  query wrapper (same untested category as every other function in `src/lib/db/generations.ts`).
  `Pagination`/`GenerationStatusBadge`/`GenerationsTable` are presentational — build check +
  manual verification, no fabricated tests (this repo has no jsdom/RTL).
- Controls must be shadcn primitives only (CLAUDE.md) — `Pagination`'s prev/next controls use
  `Button`, never a raw `<button>`.
- Cap is 100 rows fetched total (explicit decision — no server-side range/count pagination).
  Page size is 25.
- Empty-state convention: **zero generations at all** → dashed-border `Card` (matching
  `ClientsHomeTabs`'s "No clients yet" pattern). **Search matched nothing** (org has
  generations, but none match the query) → inline centered text row inside the table shell
  (matching `ClientsTable`/`RecentCanvasesTable`'s "No results match" pattern). These are two
  different states — do not collapse them into one.
- `GenerationStatusBadge`'s `failed` state uses the `destructive` color tokens
  (`bg-destructive/10 text-destructive dark:bg-destructive/20`), not a muted/neutral color —
  a failed generation should visually stand out, unlike `KBStatusBadge`'s neutral `pending`
  state which represents a normal, non-error waiting state.

---

### Task 1: `listGenerationsForOrg` query

**Files:**
- Modify: `src/lib/db/generations.ts`

**Interfaces:**
- Produces: `type GenerationForOrgList = GenerationRow & { client_name: string | null }` and
  `listGenerationsForOrg(orgId: string, limit?: number): Promise<GenerationForOrgList[]>`
  (default `limit = 100`), ordered `created_at desc`. Consumed by Task 3.

- [ ] **Step 1: Add the type and function**

In `src/lib/db/generations.ts`, add (the file already imports `GenerationRow` from
`./types` and uses `createServerSupabase()` throughout — follow that exact pattern):

```ts
export type GenerationForOrgList = GenerationRow & { client_name: string | null };

export async function listGenerationsForOrg(
  orgId: string,
  limit = 100,
): Promise<GenerationForOrgList[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*, clients(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as (GenerationRow & { clients: { name: string } | null })[]).map(
    ({ clients, ...g }) => ({ ...g, client_name: clients?.name ?? null }),
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/generations.ts
git commit -m "feat(admin): add listGenerationsForOrg query"
```

---

### Task 2: `Pagination` primitive + `GenerationStatusBadge`

**Files:**
- Create: `src/components/ui/pagination.tsx`
- Create: `src/components/admin/generation-status-badge.tsx`

**Interfaces:**
- Produces: `Pagination({ page, pageCount, onPageChange, className? }: { page: number;
  pageCount: number; onPageChange: (page: number) => void; className?: string })` — renders
  `null` when `pageCount <= 1`. `GenerationStatusBadge({ status }: { status:
  GenerationRow["status"] })`. Both consumed by Task 3.

- [ ] **Step 1: Write the `Pagination` primitive**

Create `src/components/ui/pagination.tsx`:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className={cn("flex items-center justify-between gap-3 px-5 py-3", className)}>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft strokeWidth={1.5} />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `GenerationStatusBadge`**

Create `src/components/admin/generation-status-badge.tsx` (mirrors the structure of
`src/components/clients/kb-status-badge.tsx`, adapted to `GenerationRow["status"]`):

```tsx
import { cn } from "@/lib/utils";
import type { GenerationRow } from "@/lib/db/types";

const STYLES: Record<GenerationRow["status"], { label: string; className: string }> = {
  succeeded: {
    label: "Succeeded",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  running: {
    label: "Running",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
};

export function GenerationStatusBadge({ status }: { status: GenerationRow["status"] }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Verification**

Run: `npm run build`
Expected: builds successfully (both are new, unused-until-Task-3 files — build must still
pass since nothing imports them yet, but TypeScript checks the files themselves).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/pagination.tsx src/components/admin/generation-status-badge.tsx
git commit -m "feat(admin): add Pagination primitive and GenerationStatusBadge"
```

---

### Task 3: `GenerationsTable` + wire into the org detail page

**Files:**
- Create: `src/components/admin/generations-table.tsx`
- Modify: `src/app/admin/orgs/[id]/org-detail-tabs.tsx`
- Modify: `src/app/admin/orgs/[id]/page.tsx`

**Interfaces:**
- Consumes: `listGenerationsForOrg`/`GenerationForOrgList` (Task 1), `Pagination` (Task 2),
  `GenerationStatusBadge` (Task 2), existing `ListToolbar`/`filterAndSort`/
  `formatRelativeTime`/`Card`.
- Produces: `GenerationsTable({ generations }: { generations: GenerationForOrgList[] })`.
  `OrgDetailTabs` gains a new prop `generations: GenerationForOrgList[]`.

- [ ] **Step 1: Write `GenerationsTable`**

Create `src/components/admin/generations-table.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { Card } from "@/components/ui/card";
import { GenerationStatusBadge } from "@/components/admin/generation-status-badge";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { GenerationForOrgList } from "@/lib/db/generations";

const PAGE_SIZE = 25;

export function GenerationsTable({
  generations,
}: {
  generations: GenerationForOrgList[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);

  const rows = useMemo(
    () =>
      filterAndSort(generations, query, sort, {
        name: (g) => g.model_used ?? "",
        timestamp: (g) => g.created_at,
      }),
    [generations, query, sort],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = rows.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function handleQueryChange(next: string) {
    setQuery(next);
    setPage(1);
  }
  function handleSortChange(next: SortKey) {
    setSort(next);
    setPage(1);
  }

  if (generations.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
        <p className="font-display text-lg font-medium">No generations yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Generations created for this org's clients will show up here.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={handleQueryChange}
        sort={sort}
        onSortChange={handleSortChange}
        placeholder="Search by model…"
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-1">Type</span>
          <span className="flex-1">Status</span>
          <span className="flex-[2]">Model</span>
          <span className="flex-[2]">Client</span>
          <span className="flex-1">Credits</span>
          <span className="flex-1 text-right">Created</span>
        </div>

        {pageRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No generations match “{query}”.
          </p>
        ) : (
          <ul>
            {pageRows.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0"
              >
                <span className="flex-1 text-sm capitalize">{g.type}</span>
                <span className="flex-1">
                  <GenerationStatusBadge status={g.status} />
                </span>
                <span className="flex-[2] text-sm text-muted-foreground">
                  {g.model_used ?? "—"}
                </span>
                <span className="flex-[2] text-sm text-muted-foreground">
                  {g.client_name ?? "—"}
                </span>
                <span className="flex-1 text-sm text-muted-foreground">
                  {g.credits_consumed ?? "—"}
                </span>
                <span className="flex-1 text-right text-sm text-muted-foreground">
                  {formatRelativeTime(g.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={clampedPage}
          pageCount={pageCount}
          onPageChange={setPage}
          className="border-t"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `OrgDetailTabs`**

In `src/app/admin/orgs/[id]/org-detail-tabs.tsx`:

Add the import:

```ts
import { GenerationsTable } from "@/components/admin/generations-table";
import type { GenerationForOrgList } from "@/lib/db/generations";
```

Add `generations: GenerationForOrgList[]` to the component's props type (alongside `org`,
`members`, `generationCount`), and destructure it in the function signature.

Replace the Generations `TabsContent` block — currently:

```tsx
      <TabsContent value="generations" className="animate-rise">
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
          <p className="font-display text-lg font-medium">Generations view coming soon</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This org's generation activity will show up here.
          </p>
        </Card>
      </TabsContent>
```

with:

```tsx
      <TabsContent value="generations" className="animate-rise">
        <GenerationsTable generations={generations} />
      </TabsContent>
```

- [ ] **Step 3: Fetch and pass the data from the page**

In `src/app/admin/orgs/[id]/page.tsx`:

Change the import line:

```ts
import { countGenerationsForOrg } from "@/lib/db/generations";
```

to:

```ts
import { countGenerationsForOrg, listGenerationsForOrg } from "@/lib/db/generations";
```

Change the data-fetching block from:

```tsx
  const [members, generationCount] = await Promise.all([
    listOrgMembers(id),
    countGenerationsForOrg(id),
  ]);
```

to:

```tsx
  const [members, generationCount, generations] = await Promise.all([
    listOrgMembers(id),
    countGenerationsForOrg(id),
    listGenerationsForOrg(id),
  ]);
```

And update the `<OrgDetailTabs .../>` call from:

```tsx
      <OrgDetailTabs org={org} members={members} generationCount={generationCount} />
```

to:

```tsx
      <OrgDetailTabs
        org={org}
        members={members}
        generationCount={generationCount}
        generations={generations}
      />
```

- [ ] **Step 4: Verification**

Run: `npm run build`
Expected: builds successfully.

Manual check (staging): org detail page's Generations tab shows a real table for an org
with generations (search/sort/pagination all work), and the dashed empty-state Card for an
org with zero generations. `countGenerationsForOrg`'s Overview stat tile total still matches
reality even when it exceeds the 100-row cap shown in the table itself.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/generations-table.tsx src/app/admin/orgs/[id]/org-detail-tabs.tsx src/app/admin/orgs/[id]/page.tsx
git commit -m "feat(admin): render generations table in org detail page"
```

---

## Self-Review Notes

- **Spec coverage:** spec §5 in full, including the client-side-pagination decision made
  during brainstorming (capped fetch of 100, 25/page, no server-side range query).
- **Type consistency:** `GenerationForOrgList` (Task 1) is the single type used by
  `GenerationsTable`'s prop (Task 3) and the page's fetch (Task 3) — no renaming.
- **No placeholders:** every step shows complete, exact code.
