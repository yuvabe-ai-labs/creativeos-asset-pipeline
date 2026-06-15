# Clients home — Clients / Recent canvases header tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Clients-home header with two prominent display-type tabs — **Clients** and **Recent canvases** — so users can jump straight into a recently-edited canvas across all clients.

**Architecture:** `src/app/page.tsx` stays a server component and fetches both lists (`listClients()` + a new `listRecentCanvases()`), passing them into a `"use client"` tab wrapper that toggles between the existing `ClientsTable` and a new `RecentCanvasesTable`. The recency list is a single Supabase query embedding the owning client; its pure row-mapper lives in a non-`server-only` module so it can be unit-tested.

**Tech Stack:** Next.js (App Router, server components), Supabase, Base UI Tabs (`src/components/ui/tabs.tsx`), Tailwind v4, Vitest (node — no React Testing Library in this repo).

**Spec:** `docs/superpowers/specs/2026-06-15-clients-home-tabs-design.md`

---

## File Structure

- **Create** `src/lib/db/recent-canvas.ts` — `RecentCanvas` type, `RawRecentCanvasRow` type, and the pure `mapRecentCanvas()` mapper. **No `server-only` import** (so the mapper is testable).
- **Create** `src/lib/db/recent-canvas.test.ts` — unit tests for `mapRecentCanvas`.
- **Modify** `src/lib/db/canvases.ts` — add `listRecentCanvases()` (uses the mapper).
- **Create** `src/components/canvases/recent-canvases-table.tsx` — the recency list (mirrors `canvases-table.tsx`).
- **Create** `src/components/clients/clients-home-tabs.tsx` — the `"use client"` header-tabs wrapper.
- **Modify** `src/app/page.tsx` — fetch both lists, render the wrapper.

---

## Task 1: `RecentCanvas` type + pure mapper

**Files:**
- Create: `src/lib/db/recent-canvas.ts`
- Test: `src/lib/db/recent-canvas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/recent-canvas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapRecentCanvas, type RawRecentCanvasRow } from "./recent-canvas";

const base: RawRecentCanvasRow = {
  id: "cv1",
  client_id: "cl1",
  slug: "hero-reel",
  name: "Hero reel",
  viewport: { x: 0, y: 0, zoom: 1 },
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-14T00:00:00Z",
  clients: { slug: "acme", name: "Acme", logo_url: "http://logo/acme.png" },
};

describe("mapRecentCanvas", () => {
  it("flattens the embedded client relation onto the canvas", () => {
    const out = mapRecentCanvas(base);
    expect(out.client_slug).toBe("acme");
    expect(out.client_name).toBe("Acme");
    expect(out.client_logo_url).toBe("http://logo/acme.png");
  });

  it("preserves the canvas fields and drops the nested object", () => {
    const out = mapRecentCanvas(base);
    expect(out.slug).toBe("hero-reel");
    expect(out.updated_at).toBe("2026-06-14T00:00:00Z");
    expect("clients" in out).toBe(false);
  });

  it("tolerates a missing/null client relation", () => {
    const out = mapRecentCanvas({ ...base, clients: null });
    expect(out.client_slug).toBe("");
    expect(out.client_name).toBe("");
    expect(out.client_logo_url).toBeNull();
  });

  it("accepts the relation as a single-element array (PostgREST shape)", () => {
    const out = mapRecentCanvas({
      ...base,
      clients: [{ slug: "globex", name: "Globex", logo_url: null }],
    });
    expect(out.client_slug).toBe("globex");
    expect(out.client_logo_url).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/db/recent-canvas.test.ts`
Expected: FAIL — cannot resolve `./recent-canvas` / `mapRecentCanvas is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/db/recent-canvas.ts` (note: **no `import "server-only"`** — this module must stay importable from tests):

```ts
import type { CanvasRow } from "./types";

// A canvas flattened with its owning client, for the global "recent canvases" list.
// The pure mapper lives here (not in the server-only canvases repo) so it is testable.

type EmbeddedClient = {
  slug: string;
  name: string;
  logo_url: string | null;
};

// Shape Supabase returns for `canvases.select("*, clients(slug, name, logo_url)")`.
// PostgREST may surface a to-one relation as an object or a single-element array.
export type RawRecentCanvasRow = CanvasRow & {
  clients: EmbeddedClient | EmbeddedClient[] | null;
};

export type RecentCanvas = CanvasRow & {
  client_slug: string;
  client_name: string;
  client_logo_url: string | null;
};

export function mapRecentCanvas(raw: RawRecentCanvasRow): RecentCanvas {
  const { clients, ...canvas } = raw;
  const client = Array.isArray(clients) ? (clients[0] ?? null) : clients;
  return {
    ...canvas,
    client_slug: client?.slug ?? "",
    client_name: client?.name ?? "",
    client_logo_url: client?.logo_url ?? null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/db/recent-canvas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/recent-canvas.ts src/lib/db/recent-canvas.test.ts
git commit -m "feat(db): add RecentCanvas type + tested row mapper"
```

---

## Task 2: `listRecentCanvases` repository function

**Files:**
- Modify: `src/lib/db/canvases.ts`

No new unit test — the shaping is covered by Task 1; this step only wires the Supabase query to the mapper. Verified by typecheck/build.

- [ ] **Step 1: Add the import**

At the top of `src/lib/db/canvases.ts`, below the existing imports, add:

```ts
import { mapRecentCanvas, type RawRecentCanvasRow, type RecentCanvas } from "./recent-canvas";
```

- [ ] **Step 2: Add the function**

Append to `src/lib/db/canvases.ts` (after `createCanvas`):

```ts
// Global, recency-sorted canvases across every client (for the Clients-home
// "Recent canvases" tab). Capped so the list stays bounded as canvas count grows.
export async function listRecentCanvases(limit = 30): Promise<RecentCanvas[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*, clients(slug, name, logo_url)")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as RawRecentCanvasRow[]).map(mapRecentCanvas);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the cast bridges Supabase's loose generated row type to `RawRecentCanvasRow`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/canvases.ts
git commit -m "feat(db): add listRecentCanvases global query"
```

---

## Task 3: `RecentCanvasesTable` component

**Files:**
- Create: `src/components/canvases/recent-canvases-table.tsx`

Mirrors `src/components/canvases/canvases-table.tsx`. Adds a Client chip column. No unit test (no React Testing Library in this repo); verified by build + lint + manual check in Task 5.

- [ ] **Step 1: Write the component**

Create `src/components/canvases/recent-canvases-table.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { RecentCanvas } from "@/lib/db/recent-canvas";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function RecentCanvasesTable({
  canvases,
}: {
  canvases: RecentCanvas[];
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
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-[3]">Canvas</span>
          <span className="flex-[2]">Client</span>
          <span className="flex-1 text-right">Last edited</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No canvases match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((canvas) => (
              <li key={canvas.id} className="border-b last:border-b-0">
                <Link
                  href={`/clients/${canvas.client_slug}/canvases/${canvas.slug}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="flex-[3] font-medium">{canvas.name}</span>
                  <span className="flex flex-[2] items-center gap-2.5 text-sm text-muted-foreground">
                    {canvas.client_logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={canvas.client_logo_url}
                        alt=""
                        className="size-7 shrink-0 rounded-md border bg-card object-contain p-0.5"
                      />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-[0.6rem] font-semibold text-muted-foreground/50">
                        {initials(canvas.client_name)}
                      </span>
                    )}
                    {canvas.client_name}
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2 text-sm text-muted-foreground">
                    {formatRelativeTime(canvas.updated_at)}
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

- [ ] **Step 2: Lint the new file**

Run: `npx eslint src/components/canvases/recent-canvases-table.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/canvases/recent-canvases-table.tsx
git commit -m "feat(ui): add RecentCanvasesTable with client chip column"
```

---

## Task 4: `ClientsHomeTabs` wrapper

**Files:**
- Create: `src/components/clients/clients-home-tabs.tsx`

Holds the display-type `line`-variant tabs, conditionally shows `NewClientDialog`, and contains both panels. The empty-clients card moves here from `page.tsx`.

- [ ] **Step 1: Write the component**

Create `src/components/clients/clients-home-tabs.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ClientsTable } from "@/components/clients/clients-table";
import { RecentCanvasesTable } from "@/components/canvases/recent-canvases-table";
import type { ClientWithCount } from "@/lib/db/clients";
import type { RecentCanvas } from "@/lib/db/recent-canvas";

const triggerClass =
  "flex-none px-0 py-0 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground/40 data-active:text-foreground sm:text-4xl";

export function ClientsHomeTabs({
  clients,
  recentCanvases,
}: {
  clients: ClientWithCount[];
  recentCanvases: RecentCanvas[];
}) {
  const [tab, setTab] = useState("clients");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <header className="animate-rise mb-10">
        <p className="text-eyebrow">Increment 1D · persisted</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <TabsList variant="line" className="h-auto gap-6 p-0">
            <TabsTrigger value="clients" className={triggerClass}>
              Clients
            </TabsTrigger>
            <TabsTrigger value="recent" className={triggerClass}>
              Recent canvases
            </TabsTrigger>
          </TabsList>
          {tab === "clients" && <NewClientDialog />}
        </div>
      </header>

      <TabsContent value="clients" className="animate-rise">
        {clients.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
            <p className="font-display text-lg font-medium">No clients yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create one to get started — it now saves to the database and survives a refresh.
            </p>
          </Card>
        ) : (
          <ClientsTable clients={clients} />
        )}
      </TabsContent>

      <TabsContent value="recent" className="animate-rise">
        {recentCanvases.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
            <p className="font-display text-lg font-medium">No canvases yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Open a client and create a canvas — your most recently edited canvases will show up here.
            </p>
          </Card>
        ) : (
          <RecentCanvasesTable canvases={recentCanvases} />
        )}
      </TabsContent>
    </Tabs>
  );
}
```

Notes for the implementer:
- The `line` variant already renders the active-tab underline via its `after:` indicator (see `src/components/ui/tabs.tsx`); `triggerClass` only overrides size/weight/color and resets the default padding so the underline sits tight under the display type.
- `flex-none` cancels the default `flex-1` on `TabsTrigger` so each tab is only as wide as its label (they should sit left, not stretch full width).

- [ ] **Step 2: Lint the new file**

Run: `npx eslint src/components/clients/clients-home-tabs.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/clients-home-tabs.tsx
git commit -m "feat(ui): add ClientsHomeTabs header-tab wrapper"
```

---

## Task 5: Wire the wrapper into the page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/app/page.tsx` with:

```tsx
import { listClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function ClientsPage() {
  const [clients, recentCanvases] = await Promise.all([
    listClients(),
    listRecentCanvases(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <ClientsHomeTabs clients={clients} recentCanvases={recentCanvases} />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + lint + tests**

Run: `npx tsc --noEmit && npx eslint src/app/page.tsx && npx vitest run`
Expected: no type errors, no lint errors, all Vitest suites pass (including `recent-canvas.test.ts`).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds; `/` compiles as a dynamic route.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/`:
- Header shows two large display-type tabs: **Clients** (active, underlined) and **Recent canvases**.
- **New client** button is visible on the Clients tab only; it disappears when you switch to Recent canvases.
- Clients tab shows the existing clients list unchanged.
- Recent canvases tab lists canvases newest-first with a client logo/initials chip; clicking a row opens `/clients/<client>/canvases/<canvas>`.
- Search + sort work on the Recent canvases tab.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(clients): replace home header with Clients/Recent-canvases tabs"
```

---

## Self-Review notes

- **Spec coverage:** data layer (Tasks 1–2), header tabs (Task 4), recent list with client chip + last-edited (Task 3), wiring with `Promise.all` (Task 5), New-client hidden on canvases tab (Task 4), empty states relocated (Task 4), testing via the pure mapper (Task 1). All spec sections map to a task.
- **Server-only constraint:** the testable mapper lives in `recent-canvas.ts` (no `server-only`), imported by the `server-only` `canvases.ts` — this is why Task 1 precedes Task 2.
- **Type consistency:** `RecentCanvas` / `RawRecentCanvasRow` / `mapRecentCanvas` names are identical across Tasks 1, 2, and 3. `listRecentCanvases(limit = 30)` matches the spec cap.
