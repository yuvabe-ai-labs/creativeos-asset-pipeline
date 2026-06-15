# List/Table Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card grids on the Clients and Canvases screens with a "relaxed table" — search + recency/name sort, aligned columns, and the metadata (last-active, KB status) that the cards never showed.

**Architecture:** Server pages fetch rows as today and pass them to thin client-component tables. All filter/sort/format logic lives in pure functions under `src/lib/` (unit-tested in vitest's `node` env). The `listClients` query is widened to derive a true `last_active` (max canvas `updated_at`) per client.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4 + shadcn (Base UI registry), Supabase, Vitest 4.

**Test note:** `vitest.config.ts` runs in the `node` environment and only includes `src/**/*.test.ts`. Pure functions (`.ts`) get TDD unit tests. Components (`.tsx`) are NOT auto-tested — they are verified via `npm run lint` + `npx tsc --noEmit` + manual check in `npm run dev`. This is by design; keep components thin and push logic into the tested `.ts` helpers.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/lib/format/relative-time.ts` | Create | Pure `formatRelativeTime(iso, now?)` → "2h ago" etc. |
| `src/lib/format/relative-time.test.ts` | Create | Unit tests for the above |
| `src/lib/list/filter-sort.ts` | Create | Pure generic `filterAndSort` + `SortKey` type |
| `src/lib/list/filter-sort.test.ts` | Create | Unit tests for the above |
| `src/lib/db/clients.ts` | Modify | Add `last_active` to `ClientWithCount` + derive in `listClients` |
| `src/components/clients/kb-status-badge.tsx` | Create | Maps `kb_status` → styled badge |
| `src/components/ui/list-toolbar.tsx` | Create | Shared search input + sort `<select>` |
| `src/components/clients/clients-table.tsx` | Create | Client table (state + rows) |
| `src/components/canvases/canvases-table.tsx` | Create | Canvas table (state + rows) |
| `src/app/page.tsx` | Modify | Render `<ClientsTable>` instead of card grid |
| `src/app/clients/[id]/page.tsx` | Modify | Render `<CanvasesTable>` instead of card grid |

---

## Task 1: `formatRelativeTime` pure helper (TDD)

**Files:**
- Create: `src/lib/format/relative-time.ts`
- Test: `src/lib/format/relative-time.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/format/relative-time.test.ts
import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./relative-time";

const now = new Date("2026-06-15T12:00:00Z");

describe("formatRelativeTime", () => {
  it("returns an em dash for null", () => {
    expect(formatRelativeTime(null, now)).toBe("—");
  });

  it("returns an em dash for an unparseable string", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("—");
  });

  it("says 'just now' under a minute", () => {
    expect(formatRelativeTime("2026-06-15T11:59:30Z", now)).toBe("just now");
  });

  it("formats minutes", () => {
    expect(formatRelativeTime("2026-06-15T11:45:00Z", now)).toBe("15m ago");
  });

  it("formats hours", () => {
    expect(formatRelativeTime("2026-06-15T10:00:00Z", now)).toBe("2h ago");
  });

  it("says 'yesterday' between 24 and 48 hours", () => {
    expect(formatRelativeTime("2026-06-14T10:00:00Z", now)).toBe("yesterday");
  });

  it("formats days", () => {
    expect(formatRelativeTime("2026-06-12T12:00:00Z", now)).toBe("3d ago");
  });

  it("formats weeks", () => {
    expect(formatRelativeTime("2026-06-01T12:00:00Z", now)).toBe("2w ago");
  });

  it("falls back to a short date past ~5 weeks", () => {
    expect(formatRelativeTime("2026-04-01T12:00:00Z", now)).toBe("Apr 1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/format/relative-time.test.ts`
Expected: FAIL — "Failed to resolve import ./relative-time" / `formatRelativeTime is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/format/relative-time.ts
// Pure relative-time formatter. `now` is injectable so tests are deterministic.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelativeTime(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return "—";

  const diff = now.getTime() - ms;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return "yesterday";
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  if (diff < 5 * WEEK) return `${Math.floor(diff / WEEK)}w ago`;

  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/format/relative-time.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/relative-time.ts src/lib/format/relative-time.test.ts
git commit -m "feat(format): add formatRelativeTime helper"
```

---

## Task 2: `filterAndSort` pure helper (TDD)

**Files:**
- Create: `src/lib/list/filter-sort.ts`
- Test: `src/lib/list/filter-sort.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/list/filter-sort.test.ts
import { describe, it, expect } from "vitest";
import { filterAndSort, type ListAccessors } from "./filter-sort";

type Row = { name: string; ts: string | null };

const accessors: ListAccessors<Row> = {
  name: (r) => r.name,
  timestamp: (r) => r.ts,
};

const rows: Row[] = [
  { name: "Beta", ts: "2026-06-10T00:00:00Z" },
  { name: "alpha", ts: "2026-06-15T00:00:00Z" },
  { name: "Gamma", ts: null },
];

describe("filterAndSort", () => {
  it("returns all rows for an empty query", () => {
    expect(filterAndSort(rows, "", "recent", accessors)).toHaveLength(3);
  });

  it("filters by name, case-insensitively and partially", () => {
    const out = filterAndSort(rows, "AL", "recent", accessors);
    expect(out.map((r) => r.name)).toEqual(["alpha"]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterAndSort(rows, "  beta  ", "recent", accessors)).toHaveLength(1);
  });

  it("sorts by recency (newest first), nulls last", () => {
    const out = filterAndSort(rows, "", "recent", accessors);
    expect(out.map((r) => r.name)).toEqual(["alpha", "Beta", "Gamma"]);
  });

  it("sorts by name (A→Z, case-insensitive)", () => {
    const out = filterAndSort(rows, "", "name", accessors);
    expect(out.map((r) => r.name)).toEqual(["alpha", "Beta", "Gamma"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    filterAndSort(rows, "", "name", accessors);
    expect(rows).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/list/filter-sort.test.ts`
Expected: FAIL — cannot resolve `./filter-sort`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/list/filter-sort.ts
// Pure search + sort for list/table screens. Generic over the row type via accessors.

export type SortKey = "recent" | "name";

export interface ListAccessors<T> {
  name: (row: T) => string;
  timestamp: (row: T) => string | null;
}

export function filterAndSort<T>(
  rows: T[],
  query: string,
  sort: SortKey,
  accessors: ListAccessors<T>,
): T[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => accessors.name(r).toLowerCase().includes(q))
    : [...rows];

  return filtered.sort((a, b) => {
    if (sort === "name") {
      return accessors.name(a).localeCompare(accessors.name(b), undefined, {
        sensitivity: "base",
      });
    }
    // recent: newest first, missing timestamps last
    const ta = accessors.timestamp(a);
    const tb = accessors.timestamp(b);
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/list/filter-sort.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/list/filter-sort.ts src/lib/list/filter-sort.test.ts
git commit -m "feat(list): add generic filterAndSort helper"
```

---

## Task 3: Add `last_active` to the clients query

**Files:**
- Modify: `src/lib/db/clients.ts`

Currently `listClients` selects `*, canvases(count)` and derives `canvas_count`. Swap the embed to `canvases(updated_at)` so we can derive BOTH the count and the latest activity from the returned rows.

- [ ] **Step 1: Update the `ClientWithCount` type**

Replace (around line 9):

```ts
export type ClientWithCount = ClientRow & { canvas_count: number };
```

with:

```ts
export type ClientWithCount = ClientRow & {
  canvas_count: number;
  last_active: string | null; // MAX(canvas.updated_at); null when no canvases
};
```

- [ ] **Step 2: Update the `listClients` query + derivation**

Replace the body of `listClients` (the select + map, around lines 13-22) with:

```ts
  const supabase = createServerSupabase();
  // Embed canvas timestamps over the FK relationship; derive count + last_active in JS.
  const { data, error } = await supabase
    .from("clients")
    .select("*, canvases(updated_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as (ClientRow & {
    canvases: { updated_at: string }[] | null;
  })[];
  return rows.map((r) => {
    const canvases = r.canvases ?? [];
    const last_active =
      canvases.length === 0
        ? null
        : canvases.reduce(
            (max, c) => (c.updated_at > max ? c.updated_at : max),
            canvases[0].updated_at,
          );
    return { ...r, canvas_count: canvases.length, last_active };
  });
```

(ISO-8601 timestamps compare correctly as strings, so the `>` reduce is safe.)

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/clients.ts
git commit -m "feat(db): derive last_active (max canvas updated_at) in listClients"
```

---

## Task 4: `KBStatusBadge` component

**Files:**
- Create: `src/components/clients/kb-status-badge.tsx`

Small bespoke badge (3 fixed states) — no shadcn install needed. Colors via Tailwind tokens; purple is NOT used here (reserved for CTAs/focus).

- [ ] **Step 1: Create the component**

```tsx
// src/components/clients/kb-status-badge.tsx
import { cn } from "@/lib/utils";
import type { ClientRow } from "@/lib/db/types";

const STYLES: Record<ClientRow["kb_status"], { label: string; className: string }> = {
  ready: {
    label: "Ready",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  in_review: {
    label: "In review",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  pending: {
    label: "Pending",
    className: "bg-muted text-muted-foreground",
  },
};

export function KBStatusBadge({ status }: { status: ClientRow["kb_status"] }) {
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

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/kb-status-badge.tsx
git commit -m "feat(clients): add KBStatusBadge"
```

---

## Task 5: `ListToolbar` shared component

**Files:**
- Create: `src/components/ui/list-toolbar.tsx`

Search input (reuses `Input`) + a native `<select>` for sort, styled to match `Input`. Controlled via props so the parent table owns state.

- [ ] **Step 1: Create the component**

```tsx
// src/components/ui/list-toolbar.tsx
"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SortKey } from "@/lib/list/filter-sort";

export function ListToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  placeholder,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="relative flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
          aria-label={placeholder}
        />
      </div>
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        aria-label="Sort by"
        className={cn(
          "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm",
          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <option value="recent">Recent</option>
        <option value="name">Name</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/list-toolbar.tsx
git commit -m "feat(ui): add ListToolbar (search + sort)"
```

---

## Task 6: `ClientsTable` + wire the Clients page

**Files:**
- Create: `src/components/clients/clients-table.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the table component**

```tsx
// src/components/clients/clients-table.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { KBStatusBadge } from "@/components/clients/kb-status-badge";
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

export function ClientsTable({ clients }: { clients: ClientWithCount[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const rows = useMemo(
    () =>
      filterAndSort(clients, query, sort, {
        name: (c) => c.name,
        timestamp: (c) => c.last_active,
      }),
    [clients, query, sort],
  );

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        placeholder="Search clients…"
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="text-eyebrow flex items-center gap-4 border-b px-4 py-2.5 text-muted-foreground">
          <span className="flex-[3]">Client</span>
          <span className="flex-[2]">Activity</span>
          <span className="flex-1 text-right">Brand KB</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No clients match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((client) => (
              <li key={client.id} className="border-b last:border-b-0">
                <Link
                  href={`/clients/${client.slug}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="flex flex-[3] items-center gap-3">
                    {client.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={client.logo_url}
                        alt=""
                        className="size-9 shrink-0 rounded-md border bg-card object-contain p-1"
                      />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-xs font-semibold text-muted-foreground/50">
                        {initials(client.name)}
                      </span>
                    )}
                    <span className="font-medium">{client.name}</span>
                  </span>
                  <span className="flex-[2] text-sm text-muted-foreground">
                    {client.canvas_count} canvas
                    {client.canvas_count === 1 ? "" : "es"}
                    <span className="text-muted-foreground/60">
                      {" · "}
                      {formatRelativeTime(client.last_active)}
                    </span>
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2">
                    <KBStatusBadge status={client.kb_status} />
                    <ChevronRight
                      className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                    />
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

- [ ] **Step 2: Replace the card grid in `src/app/page.tsx`**

Remove the `Card`/`CardDescription`/`CardHeader`/`CardTitle` imports and the `initials` helper (now lives in the table). Replace the whole `{clients.length === 0 ? (...) : (...)}` block with the table; keep the existing empty-state card. The file becomes:

```tsx
import { listClients } from "@/lib/db/clients";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ClientsTable } from "@/components/clients/clients-table";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <header className="animate-rise mb-10 flex items-end justify-between">
        <div>
          <p className="text-eyebrow">Increment 1D · persisted</p>
          <h1 className="mt-2 font-display text-5xl font-semibold tracking-[-0.02em]">
            Clients
          </h1>
        </div>
        <NewClientDialog />
      </header>

      {clients.length === 0 ? (
        <Card className="animate-rise flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
          <p className="font-display text-lg font-medium">No clients yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create one to get started — it now saves to the database and survives a refresh.
          </p>
        </Card>
      ) : (
        <div className="animate-rise">
          <ClientsTable clients={clients} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (the now-unused `Card*` and `Link` imports are gone).

- [ ] **Step 4: Manual check**

Run: `npm run dev`, open `http://localhost:3000/`. Expect a table with search box, Recent/Name sort, KB badges, and "N canvases · <relative time>". Type in search → list filters. Switch sort → order changes. Click a row → navigates to the client.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/clients-table.tsx src/app/page.tsx
git commit -m "feat(clients): replace card grid with relaxed table"
```

---

## Task 7: `CanvasesTable` + wire the Canvas page

**Files:**
- Create: `src/components/canvases/canvases-table.tsx`
- Modify: `src/app/clients/[id]/page.tsx`

- [ ] **Step 1: Create the table component**

```tsx
// src/components/canvases/canvases-table.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { CanvasRow } from "@/lib/db/types";

export function CanvasesTable({
  canvases,
  clientSlug,
}: {
  canvases: CanvasRow[];
  clientSlug: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const rows = useMemo(
    () =>
      filterAndSort(canvases, query, sort, {
        name: (c) => c.name,
        timestamp: (c) => c.updated_at,
      }),
    [canvases, query, sort],
  );

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        placeholder="Search canvases…"
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="text-eyebrow flex items-center gap-4 border-b px-4 py-2.5 text-muted-foreground">
          <span className="flex-[3]">Canvas</span>
          <span className="flex-[2]">Last edited</span>
          <span className="flex-1 text-right">Created</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No canvases match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((canvas) => (
              <li key={canvas.id} className="border-b last:border-b-0">
                <Link
                  href={`/clients/${clientSlug}/canvases/${canvas.slug}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="flex-[3] font-medium">{canvas.name}</span>
                  <span className="flex-[2] text-sm text-muted-foreground">
                    {formatRelativeTime(canvas.updated_at)}
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2 text-sm text-muted-foreground">
                    {new Date(canvas.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                    <ChevronRight
                      className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                    />
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

- [ ] **Step 2: Replace the card grid in `src/app/clients/[id]/page.tsx`**

Replace the `<ul className="grid gap-3 sm:grid-cols-2">…</ul>` block (lines ~127-146, inside the `canvases.length === 0 ? (...) : (...)` ternary's else branch) with:

```tsx
        <div className="animate-rise">
          <CanvasesTable canvases={canvases} clientSlug={client.slug} />
        </div>
```

Add the import at the top alongside the other component imports:

```tsx
import { CanvasesTable } from "@/components/canvases/canvases-table";
```

Then remove the now-unused `Card` import IF it is no longer referenced — note `Card` is still used by the "Client not found" and "No canvases yet" empty states, so **keep the `Card` import**. (The eval-harness canvas stays in the list as a normal row — no special handling, per spec.)

- [ ] **Step 3: Verify typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, open a client with canvases (e.g. `/clients/max`). Expect a table: Canvas / Last edited / Created, search + sort working, rows link into the editor, eval-harness present as an ordinary row.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvases/canvases-table.tsx "src/app/clients/[id]/page.tsx"
git commit -m "feat(canvases): replace card grid with relaxed table"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — `relative-time.test.ts` (9) + `filter-sort.test.ts` (6).

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all succeed, no errors.

- [ ] **Step 3: Manual smoke of both screens**

`npm run dev` and confirm on both `/` and a client page: search filters, sort toggles Recent↔Name, timestamps render ("—" for a client with zero canvases), KB badges show correct colors, rows navigate. Empty-state cards still appear when there are zero clients / zero canvases.

- [ ] **Step 4: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore: list/table redesign verification cleanup"
```

---

## Self-Review

**Spec coverage:**
- Relaxed-table layout, both screens → Tasks 6, 7. ✓
- Search + recency/name sort → Tasks 2, 5. ✓
- KB status badge → Task 4. ✓
- Last-active = MAX(canvas.updated_at) → Task 3. ✓
- Canvas columns Name/Last edited/Created → Task 7. ✓
- eval-harness stays as normal row → Task 7 Step 2. ✓
- Empty states preserved → Tasks 6, 7. ✓
- Pure-function tests (relative-time, filter-sort) → Tasks 1, 2. ✓
- Out-of-scope items (header-click sort, filters, bulk actions) → not implemented. ✓

**Type consistency:** `SortKey`, `ListAccessors`, `filterAndSort`, `ClientWithCount.last_active`, `KBStatusBadge` props, `ListToolbar` props, and `formatRelativeTime(iso, now?)` signatures are used identically across tasks. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓
