# Archive Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reversible soft-delete ("archive") for clients — archived clients drop out of the main Clients list and appear under a new **Archived** tab, toggled from a `⋯` row action menu.

**Architecture:** A nullable `archived_at` timestamp on `clients` (NULL = active). The repository filters the main list to active rows and adds an archived-list query plus a setter. A `PATCH /api/clients/[id]` route flips the flag. The UI gains an Archived tab and a per-row `⋯` Popover that calls the route and `router.refresh()`es. Pure logic (count mapping, body validation) lives in non-`server-only` modules so it is unit-testable with vitest, mirroring `recent-canvas.ts`.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, Supabase (`@supabase/supabase-js`), Base UI (`@base-ui/react`) shadcn components, Tailwind v4, vitest, lucide-react.

---

## Spec

`docs/superpowers/specs/2026-06-17-archive-client-design.md`

## Setup

- [ ] **Create a feature branch** (we are on `main`)

```bash
git checkout -b feat/client-archive
```

## File Structure

- Create: `supabase/migrations/0006_client_archive.sql` — the `archived_at` column + index.
- Modify: `src/lib/db/types.ts` — add `archived_at` to `ClientRow`.
- Create: `src/lib/db/client-with-count.ts` — pure `mapClientWithCount` + `ClientWithCount` type (extracted from `clients.ts`).
- Create: `src/lib/db/client-with-count.test.ts` — unit tests for the mapper.
- Modify: `src/lib/db/clients.ts` — use the mapper; filter `listClients`; add `listArchivedClients` + `setClientArchived`.
- Create: `src/lib/clients/parse-archived-body.ts` — pure PATCH-body validator.
- Create: `src/lib/clients/parse-archived-body.test.ts` — unit tests for the validator.
- Create: `src/app/api/clients/[id]/route.ts` — `PATCH` handler.
- Create: `src/components/clients/client-row-actions.tsx` — `⋯` Popover (Archive/Unarchive).
- Modify: `src/components/clients/clients-table.tsx` — `archived` prop + render row actions.
- Modify: `src/components/clients/clients-home-tabs.tsx` — Archived tab.
- Modify: `src/app/page.tsx` — fetch + pass archived clients.

---

## Task 1: Migration — add `archived_at`

**Files:**
- Create: `supabase/migrations/0006_client_archive.sql`
- Modify: `src/lib/db/types.ts:4-13`

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0006_client_archive.sql`:

```sql
-- Client soft delete (archive). NULL = active, timestamp = archived.
-- Reversible: unarchive sets archived_at back to NULL. No data is destroyed.
alter table clients add column archived_at timestamptz;

-- Supports both list filters: `archived_at is null` (active) and
-- `archived_at is not null order by archived_at desc` (archived tab).
create index clients_archived_at_idx on clients (archived_at);
```

- [ ] **Step 2: Apply the migration to Supabase**

DDL cannot go through the JS service-role client (REST has no SQL execution). Apply it one of two ways:
- **Supabase Dashboard → SQL Editor:** paste the file contents and Run; **or**
- **CLI (if configured):** `npx supabase db push`

- [ ] **Step 3: Verify the column exists**

In the SQL Editor:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'clients' and column_name = 'archived_at';
```

Expected: one row — `archived_at | timestamp with time zone | YES`.

- [ ] **Step 4: Add the field to `ClientRow`**

In `src/lib/db/types.ts`, add `archived_at` to the `ClientRow` type (after `updated_at`):

```ts
export type ClientRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  kb_status: "pending" | "in_review" | "ready";
  active_kb_version_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null; // null = active; ISO timestamp = archived
};
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add supabase/migrations/0006_client_archive.sql src/lib/db/types.ts
git commit -m "feat(archive): add archived_at column to clients

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Extract the pure `mapClientWithCount` helper (TDD)

The canvas-count mapping is currently inline in `listClients` (`clients.ts:25-35`). Extract it to a non-`server-only` module so it is testable and reusable by `listArchivedClients`. Mirrors `recent-canvas.ts`.

**Files:**
- Create: `src/lib/db/client-with-count.ts`
- Test: `src/lib/db/client-with-count.test.ts`
- Modify: `src/lib/db/clients.ts:9-36`

- [ ] **Step 1: Write the failing test**

`src/lib/db/client-with-count.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapClientWithCount, type RawClientWithCanvases } from "./client-with-count";

const base: RawClientWithCanvases = {
  id: "cl1",
  slug: "acme",
  name: "Acme",
  logo_url: null,
  kb_status: "pending",
  active_kb_version_id: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  archived_at: null,
  canvases: [
    { updated_at: "2026-06-10T00:00:00Z" },
    { updated_at: "2026-06-14T00:00:00Z" },
  ],
};

describe("mapClientWithCount", () => {
  it("counts canvases and takes the latest updated_at as last_active", () => {
    const out = mapClientWithCount(base);
    expect(out.canvas_count).toBe(2);
    expect(out.last_active).toBe("2026-06-14T00:00:00Z");
  });

  it("returns count 0 and null last_active when there are no canvases", () => {
    const out = mapClientWithCount({ ...base, canvases: [] });
    expect(out.canvas_count).toBe(0);
    expect(out.last_active).toBeNull();
  });

  it("tolerates a null canvases relation", () => {
    const out = mapClientWithCount({ ...base, canvases: null });
    expect(out.canvas_count).toBe(0);
    expect(out.last_active).toBeNull();
  });

  it("preserves the client fields", () => {
    const out = mapClientWithCount(base);
    expect(out.slug).toBe("acme");
    expect(out.archived_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/db/client-with-count.test.ts`
Expected: FAIL — cannot resolve `./client-with-count`.

- [ ] **Step 3: Write the module**

`src/lib/db/client-with-count.ts`:

```ts
import type { ClientRow } from "./types";

// Pure mapper for the clients list (count + last_active derived from embedded
// canvas timestamps). Lives here, not in the server-only repo, so it is testable.

export type ClientWithCount = ClientRow & {
  canvas_count: number;
  last_active: string | null; // MAX(canvas.updated_at); null when no canvases
};

// Shape Supabase returns for `clients.select("*, canvases(updated_at)")`.
export type RawClientWithCanvases = ClientRow & {
  canvases: { updated_at: string }[] | null;
};

export function mapClientWithCount(row: RawClientWithCanvases): ClientWithCount {
  const canvases = row.canvases ?? [];
  const last_active =
    canvases.length === 0
      ? null
      : canvases.reduce(
          (max, c) => (c.updated_at > max ? c.updated_at : max),
          canvases[0].updated_at,
        );
  const { canvases: _drop, ...client } = row;
  return { ...client, canvas_count: canvases.length, last_active };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/db/client-with-count.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor `clients.ts` to use the helper**

In `src/lib/db/clients.ts`: remove the inline `ClientWithCount` type and the inline mapping; import from the new module and re-export the type. Replace lines 9-36 (the `ClientWithCount` type + `listClients` body) with:

```ts
import {
  mapClientWithCount,
  type ClientWithCount,
  type RawClientWithCanvases,
} from "./client-with-count";

export type { ClientWithCount };

export async function listClients(): Promise<ClientWithCount[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("*, canvases(updated_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawClientWithCanvases[]).map(mapClientWithCount);
}
```

(Leave `getClientById`, `getClientBySlug`, `createClient`, `updateClientLogoUrl`, `setKBStatus` untouched.)

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/client-with-count.ts src/lib/db/client-with-count.test.ts src/lib/db/clients.ts
git commit -m "refactor(archive): extract pure mapClientWithCount helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Repository — filter active, list archived, set flag

**Files:**
- Modify: `src/lib/db/clients.ts` (`listClients` + two new functions)

- [ ] **Step 1: Filter `listClients` to active clients only**

In `src/lib/db/clients.ts`, add the `archived_at is null` filter to the `listClients` query (between `.select(...)` and `.order(...)`):

```ts
    .select("*, canvases(updated_at)")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
```

- [ ] **Step 2: Add `listArchivedClients` and `setClientArchived`**

Append to `src/lib/db/clients.ts`:

```ts
export async function listArchivedClients(): Promise<ClientWithCount[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("*, canvases(updated_at)")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawClientWithCanvases[]).map(mapClientWithCount);
}

export async function setClientArchived(
  clientId: string,
  archived: boolean,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", clientId);
  if (error) throw error;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/clients.ts
git commit -m "feat(archive): list active/archived clients + setClientArchived

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Pure `parseArchivedBody` validator (TDD)

**Files:**
- Create: `src/lib/clients/parse-archived-body.ts`
- Test: `src/lib/clients/parse-archived-body.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/clients/parse-archived-body.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseArchivedBody } from "./parse-archived-body";

describe("parseArchivedBody", () => {
  it("returns the boolean when body is { archived: boolean }", () => {
    expect(parseArchivedBody({ archived: true })).toBe(true);
    expect(parseArchivedBody({ archived: false })).toBe(false);
  });

  it("returns null for a missing or non-boolean archived field", () => {
    expect(parseArchivedBody({})).toBeNull();
    expect(parseArchivedBody({ archived: "yes" })).toBeNull();
    expect(parseArchivedBody({ archived: 1 })).toBeNull();
  });

  it("returns null for non-object bodies", () => {
    expect(parseArchivedBody(null)).toBeNull();
    expect(parseArchivedBody(undefined)).toBeNull();
    expect(parseArchivedBody("true")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/clients/parse-archived-body.test.ts`
Expected: FAIL — cannot resolve `./parse-archived-body`.

- [ ] **Step 3: Write the validator**

`src/lib/clients/parse-archived-body.ts`:

```ts
// Validate the PATCH /api/clients/[id] body. Returns the archived boolean, or
// null when the body is malformed (caller maps null -> 400).
export function parseArchivedBody(body: unknown): boolean | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "archived" in body &&
    typeof (body as { archived: unknown }).archived === "boolean"
  ) {
    return (body as { archived: boolean }).archived;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/clients/parse-archived-body.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clients/parse-archived-body.ts src/lib/clients/parse-archived-body.test.ts
git commit -m "feat(archive): pure validator for the archive PATCH body

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `PATCH /api/clients/[id]` route

**Files:**
- Create: `src/app/api/clients/[id]/route.ts`

- [ ] **Step 1: Write the route**

`src/app/api/clients/[id]/route.ts`:

```ts
import {
  apiError,
  apiOk,
  withClient,
  withTryCatch,
} from "@/lib/api/route-helpers";
import { setClientArchived } from "@/lib/db/clients";
import { parseArchivedBody } from "@/lib/clients/parse-archived-body";

// PATCH /api/clients/:id — archive or unarchive a client. Body: { archived: boolean }.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, (clientId) =>
    withTryCatch("Archive update failed", async () => {
      const archived = parseArchivedBody(await req.json().catch(() => null));
      if (archived === null) {
        return apiError("`archived` must be a boolean.", 400);
      }
      await setClientArchived(clientId, archived);
      return apiOk({ ok: true });
    }),
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`npm run dev`), then with a real client id from your DB:

```bash
curl -X PATCH http://localhost:3000/api/clients/<REAL_ID> \
  -H "Content-Type: application/json" -d '{"archived":true}'
```

Expected: `{"ok":true}`. A bad body (`-d '{}'`) returns `{"error":"`archived` must be a boolean."}` with 400; an unknown id returns `{"error":"Client not found."}` with 404. Unarchive it again with `{"archived":false}` so the next task starts clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clients/[id]/route.ts
git commit -m "feat(archive): PATCH /api/clients/[id] archive endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `ClientRowActions` component

A client component: a `⋯` Popover trigger with a single Archive/Unarchive action that PATCHes and refreshes. Uses the existing `Popover` (`src/components/ui/popover.tsx`).

**Files:**
- Create: `src/components/clients/client-row-actions.tsx`

- [ ] **Step 1: Write the component**

`src/components/clients/client-row-actions.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Archive, ArchiveRestore } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function ClientRowActions({
  clientId,
  archived,
}: {
  clientId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Client actions"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 gap-0 p-1">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
        >
          {archived ? (
            <ArchiveRestore className="size-4" strokeWidth={1.5} />
          ) : (
            <Archive className="size-4" strokeWidth={1.5} />
          )}
          {archived ? "Unarchive" : "Archive"}
        </button>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/clients/client-row-actions.tsx
git commit -m "feat(archive): client row action menu (archive/unarchive)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire row actions into `ClientsTable`

The row is currently a single full-width `<Link>`. Restructure so the `⋯` menu is a **sibling** of the link (clicks must not navigate), and add an `archived` prop that flows to `ClientRowActions`.

**Files:**
- Modify: `src/components/clients/clients-table.tsx:22-101`

- [ ] **Step 1: Add the `archived` prop**

Change the signature (`clients-table.tsx:22`):

```tsx
export function ClientsTable({
  clients,
  archived = false,
}: {
  clients: ClientWithCount[];
  archived?: boolean;
}) {
```

- [ ] **Step 2: Add the import**

At the top of the file, with the other imports:

```tsx
import { ClientRowActions } from "@/components/clients/client-row-actions";
```

- [ ] **Step 3: Restructure the row to host the menu**

Replace the `<li>…</li>` block (`clients-table.tsx:59-95`) with a flex row that holds the `<Link>` and the actions as siblings:

```tsx
              <li
                key={client.id}
                className="flex items-center border-b last:border-b-0 hover:bg-muted/40"
              >
                <Link
                  href={`/clients/${client.slug}`}
                  className="group flex flex-1 items-center gap-4 px-5 py-3.5 transition-colors"
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
                    <span className="font-medium">
                      {client.name}
                      <span className="ml-1.5 font-normal text-muted-foreground/60">
                        ({client.canvas_count})
                      </span>
                    </span>
                  </span>
                  <span className="flex-[2] text-sm text-muted-foreground">
                    {formatRelativeTime(client.last_active)}
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2">
                    <KBStatusBadge status={client.kb_status} />
                  </span>
                </Link>
                <div className="pr-3 pl-1">
                  <ClientRowActions clientId={client.id} archived={archived} />
                </div>
              </li>
```

(The `ChevronRight` is dropped — the `⋯` menu now owns the row's right edge. Remove the now-unused `ChevronRight` import from `lucide-react` at `clients-table.tsx:5`.)

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (no unused `ChevronRight`).

```bash
git add src/components/clients/clients-table.tsx
git commit -m "feat(archive): render row action menu in clients table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Archived tab + page wiring (end-to-end)

**Files:**
- Modify: `src/components/clients/clients-home-tabs.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Accept archived clients + render the tab**

In `src/components/clients/clients-home-tabs.tsx`:

Add `archivedClients` to the props:

```tsx
export function ClientsHomeTabs({
  clients,
  archivedClients,
  recentCanvases,
}: {
  clients: ClientWithCount[];
  archivedClients: ClientWithCount[];
  recentCanvases: RecentCanvas[];
}) {
```

Add a third trigger inside `<TabsList>` (after the "Recent" trigger):

```tsx
            <TabsTrigger value="archived" className={triggerClass}>
              Archived
            </TabsTrigger>
```

Add the matching content (after the "recent" `TabsContent`):

```tsx
      <TabsContent value="archived" className="animate-rise">
        {archivedClients.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
            <p className="font-display text-lg font-medium">No archived clients</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Archive a client from its ⋯ menu and it will move here — you can
              restore it anytime.
            </p>
          </Card>
        ) : (
          <ClientsTable clients={archivedClients} archived />
        )}
      </TabsContent>
```

- [ ] **Step 2: Fetch + pass archived clients from the page**

Replace the body of `src/app/page.tsx`:

```tsx
import { listClients, listArchivedClients } from "@/lib/db/clients";
import { listRecentCanvases } from "@/lib/db/canvases";
import { ClientsHomeTabs } from "@/components/clients/clients-home-tabs";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function ClientsPage() {
  const [clients, archivedClients, recentCanvases] = await Promise.all([
    listClients(),
    listArchivedClients(),
    listRecentCanvases(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <ClientsHomeTabs
        clients={clients}
        archivedClients={archivedClients}
        recentCanvases={recentCanvases}
      />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + full test + lint**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: all PASS, no errors.

- [ ] **Step 4: Manual end-to-end verification**

With `npm run dev` running and the migration applied:
1. On the home page, open a client's `⋯` menu → **Archive**. The row disappears from **Clients** and appears under **Archived**.
2. In **Archived**, open the `⋯` menu → **Unarchive**. The row returns to **Clients**.
3. Refresh the page — the state persists (it's in the DB).

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/clients-home-tabs.tsx src/app/page.tsx
git commit -m "feat(archive): Archived tab on the clients home

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** `archived_at` column (T1) ✓; `listClients` filters active (T3) ✓; Archived tab (T8) ✓; row `⋯` menu Archive/Unarchive (T6, T7) ✓; `PATCH {archived}` (T5) ✓; reversible/unarchive→null (T3 setter) ✓; nullable-timestamp rationale (spec) ✓; error handling 400/404/500 (T5 route + `withClient`/`withTryCatch`) ✓; tests for mapper + validator (T2, T4) ✓.
- **Placeholder scan:** none — every code step has full content.
- **Type consistency:** `mapClientWithCount`, `ClientWithCount`, `RawClientWithCanvases`, `setClientArchived`, `listArchivedClients`, `parseArchivedBody`, `ClientRowActions({clientId, archived})` are defined once and referenced consistently across tasks.
- **Note on testability:** DB-query filtering (`.is/.not`) and the route's happy path are verified manually (Steps with curl / dev server), matching the repo's convention of unit-testing only pure functions (`recent-canvas.ts` precedent) and not mocking Supabase.
