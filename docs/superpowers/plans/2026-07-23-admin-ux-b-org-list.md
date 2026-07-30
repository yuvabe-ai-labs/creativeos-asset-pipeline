# AX-B: Org List Page Restyle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/admin`'s plain Card-per-row org list with the same row-table pattern
`ClientsTable`/`RecentCanvasesTable` use, for visual consistency with the clients page.

**Architecture:** A second call site for the `initials()` helper (already duplicated
verbatim in `ClientsTable` and `RecentCanvasesTable`) triggers this project's "two call
sites = extract" rule, so it moves to a shared `src/lib/format/initials.ts` first. Then a
new `OrgsTable` client component reuses `ListToolbar` + `filterAndSort` exactly like the
other two tables, and `src/app/admin/page.tsx` renders it instead of the current `Card` map.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, existing `ListToolbar`/
`filterAndSort` list utilities, shadcn `Card`.

## Global Constraints

- Testing convention: see `docs/superpowers/plans/2026-07-23-admin-ux-index.md` — this repo
  unit-tests pure logic only (vitest, plain Node, no jsdom/RTL). The new `initials()` helper
  is pure logic and gets a real unit test; the `OrgsTable` component and page wiring get a
  build check + manual verification, not a fabricated test.
- Controls must be shadcn primitives only (CLAUDE.md) — no raw `<button>`/`<input>`/etc.
  (Note: `ListToolbar`, which this task reuses unmodified, already contains a raw `<select>`
  predating this work — out of scope to fix here, not introduced by this plan.)
- Follow the existing `ClientsTable`/`RecentCanvasesTable` visual pattern exactly: same
  `overflow-hidden rounded-xl border bg-card shadow-card` table shell, `text-eyebrow` header
  row, hover rows, initials-chip avatar fallback.

---

### Task 1: Extract shared `initials()` helper

**Files:**
- Create: `src/lib/format/initials.ts`
- Test: `src/lib/format/initials.test.ts`
- Modify: `src/components/clients/clients-table.tsx`
- Modify: `src/components/canvases/recent-canvases-table.tsx`

**Interfaces:**
- Produces: `initials(name: string): string` — takes the first letter of up to the first 2
  whitespace-separated words, uppercased, joined. Consumed by Task 2 (`OrgsTable`) and the
  two existing tables modified in this task.

- [ ] **Step 1: Write the failing test**

Create `src/lib/format/initials.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(initials("Acme Studio")).toBe("AS");
  });

  it("handles a single word", () => {
    expect(initials("Acme")).toBe("A");
  });

  it("ignores extra whitespace and words beyond the first two", () => {
    expect(initials("  Acme   Creative   Studio  ")).toBe("AC");
  });

  it("returns an empty string for empty input", () => {
    expect(initials("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/format/initials.test.ts`
Expected: FAIL — `Cannot find module './initials'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/format/initials.ts`:

```ts
// Shared by any table row that shows a fallback avatar when there's no logo — first
// letter of up to the first two words, uppercased.
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/format/initials.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Update `ClientsTable` to import the shared helper**

In `src/components/clients/clients-table.tsx`, remove the local `initials()` function
(currently lines 12-20) and add the import instead. The top of the file changes from:

```ts
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { KBStatusBadge } from "@/components/clients/kb-status-badge";
import { ClientRowActions } from "@/components/clients/client-row-actions";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { ClientWithCount } from "@/lib/db/clients";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
```

to:

```ts
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { KBStatusBadge } from "@/components/clients/kb-status-badge";
import { ClientRowActions } from "@/components/clients/client-row-actions";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { initials } from "@/lib/format/initials";
import type { ClientWithCount } from "@/lib/db/clients";
```

The rest of the file (which calls `initials(client.name)`) is unchanged.

- [ ] **Step 6: Update `RecentCanvasesTable` the same way**

In `src/components/canvases/recent-canvases-table.tsx`, apply the identical change: remove
the local `initials()` function (currently lines 11-19) and add
`import { initials } from "@/lib/format/initials";` to the import block. The rest of the
file (which calls `initials(canvas.client_name)`) is unchanged.

- [ ] **Step 7: Full verification**

Run: `npm run build`
Expected: builds successfully.

Run: `npm test`
Expected: all tests pass, including the 4 new `initials` tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/format/initials.ts src/lib/format/initials.test.ts src/components/clients/clients-table.tsx src/components/canvases/recent-canvases-table.tsx
git commit -m "refactor(format): extract shared initials() helper"
```

---

### Task 2: `OrgsTable` component + wire into `/admin`

**Files:**
- Create: `src/components/admin/orgs-table.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `initials` from `@/lib/format/initials` (Task 1), `formatRelativeTime` from
  `@/lib/format/relative-time`, `filterAndSort`/`SortKey` from `@/lib/list/filter-sort`,
  `ListToolbar` from `@/components/ui/list-toolbar`, `OrgWithCount` type from
  `@/lib/db/organizations` (`{ id, name, slug, monthly_credit_limit, created_at,
  client_count }` — already returned by the existing `listOrgsWithClientCount()`, no new
  query needed).
- Produces: `OrgsTable({ orgs }: { orgs: OrgWithCount[] })` component.

- [ ] **Step 1: Write the component**

Create `src/components/admin/orgs-table.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { initials } from "@/lib/format/initials";
import type { OrgWithCount } from "@/lib/db/organizations";

export function OrgsTable({ orgs }: { orgs: OrgWithCount[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const rows = useMemo(
    () =>
      filterAndSort(orgs, query, sort, {
        name: (o) => o.name,
        timestamp: (o) => o.created_at,
      }),
    [orgs, query, sort],
  );

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        placeholder="Search organizations…"
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-[3]">Org</span>
          <span className="flex-1">Clients</span>
          <span className="flex-1">Credit limit</span>
          <span className="flex-1 text-right">Created</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No organizations match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((org) => (
              <li
                key={org.id}
                className="border-b last:border-b-0 hover:bg-muted/40"
              >
                <Link
                  href={`/admin/orgs/${org.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                >
                  <span className="flex flex-[3] items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-xs font-semibold text-muted-foreground/50">
                      {initials(org.name)}
                    </span>
                    <span className="font-medium">{org.name}</span>
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {org.client_count} client{org.client_count === 1 ? "" : "s"}
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {org.monthly_credit_limit === null
                      ? "Unlimited"
                      : org.monthly_credit_limit}
                  </span>
                  <span className="flex-1 text-right text-sm text-muted-foreground">
                    {formatRelativeTime(org.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `/admin`**

Replace the full contents of `src/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listOrgsWithClientCount } from "@/lib/db/organizations";
import { Button } from "@/components/ui/button";
import { OrgsTable } from "@/components/admin/orgs-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizations — Admin" };

export default async function AdminOrgsPage() {
  await requireSuperAdmin();
  const orgs = await listOrgsWithClientCount();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Organizations
        </h1>
        <Button
          nativeButton={false}
          render={<Link href="/admin/orgs/new">+ New org</Link>}
        />
      </div>
      <OrgsTable orgs={orgs} />
    </main>
  );
}
```

- [ ] **Step 3: Verification**

Run: `npm run build`
Expected: builds successfully.

Manual check (staging, `npm run env:staging`): `/admin` as super_admin now shows a
search+sort table matching the clients page's visual style, rows link to
`/admin/orgs/[id]`, "+ New org" still works.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/orgs-table.tsx src/app/admin/page.tsx
git commit -m "feat(admin): restyle org list as a table matching the clients page"
```

---

## Self-Review Notes

- **Spec coverage:** spec §3 in full.
- **Type consistency:** `OrgWithCount` (from `src/lib/db/organizations.ts`, unchanged by
  this plan) is used as-is; `OrgsTable`'s prop name (`orgs`) and shape match what
  `admin/page.tsx` already has in scope (`orgs` from `listOrgsWithClientCount()`).
- **No placeholders:** every step shows complete, exact code.
