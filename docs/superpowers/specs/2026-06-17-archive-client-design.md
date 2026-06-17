# Archive client — soft delete via `archived_at`

**Date:** 2026-06-17
**Status:** Designed (not yet implemented)
**Area:** Clients → archive

## Problem

There is no way to remove a client from the clients list. Test clients, duplicates, and
abandoned brands accumulate with no path to clear them. A **hard** delete is risky and
irreversible (it cascades across Postgres *and* leaves orphaned Storage blobs — see
[the purge script](../../../scripts/purge-clients.mjs)).

For day-to-day use we want a **reversible** action: archive a client so it drops out of the
working list but can be brought back. Hard deletion (a permanent purge that also clears Storage
blobs) stays out of scope for v1 — see *Hard delete, for reference* below.

## Goals

- A single `archived_at timestamptz` column on `clients` (NULL = active, set = archived).
- `listClients()` returns **active** clients only; archived ones are excluded.
- A new **Archived** tab on the clients home (beside Clients / Recent) listing archived
  clients, each with an **Unarchive** action.
- Archive / Unarchive from a **row action menu** (`⋯`) on each client row, via
  `PATCH /api/clients/[id]` with `{ archived: boolean }`.
- Fully reversible: unarchive sets `archived_at` back to NULL; no data is destroyed.

## Non-goals (deliberate v1 cuts)

- **Hard delete in the app.** Permanent deletion is out of scope. A future "Delete permanently"
  action can implement the cascade + Storage cleanup designed below under *Hard delete, for
  reference*.
- **Auto-purge of stale archives.** `archived_at` makes "archived > N days" queryable later;
  v1 does not act on it.
- **Bulk archive / multi-select.** One client at a time.
- **Auth / permission checks.** No auth exists yet (decision D14).
- **Cascading the flag.** Canvases/nodes are not individually archived; archiving is a
  client-level visibility flag only.

## Why a nullable timestamp (not a boolean)

`archived_at timestamptz null` answers both *"is it archived?"* (`archived_at is not null`)
and *"when?"* for free — enabling archive-list sorting and a future auto-purge
("archived more than 90 days ago"). A boolean throws the timestamp away. This is the standard
soft-delete pattern (Rails `deleted_at`, Laravel `SoftDeletes`).

## Design

### 1. Migration — `supabase/migrations/0006_client_archive.sql`

```sql
alter table clients add column archived_at timestamptz;        -- null = active
create index clients_archived_at_idx on clients (archived_at);  -- supports both list filters
```

`ClientRow` in `src/lib/db/types.ts` gains `archived_at: string | null`.

### 2. Repository — `src/lib/db/clients.ts`

- `listClients()` — add `.is("archived_at", null)`; still returns `ClientWithCount[]`,
  unchanged shape, active clients only.
- `listArchivedClients()` — new; `.not("archived_at", "is", null)`, ordered by
  `archived_at desc`. Returns `ClientWithCount[]` (same embed-canvases-for-count logic — factor
  the count mapping into a shared helper so the two list functions don't duplicate it).
- `setClientArchived(clientId, archived: boolean)` — sets `archived_at` to `now()` (archive)
  or `null` (unarchive). One `update … eq("id", clientId)`.

### 3. API route — `src/app/api/clients/[id]/route.ts`

`PATCH` handler, following `docs/api-routes.md` (PATCH for partial updates, `withClient` for
`clients/[id]` routes):

```ts
export async function PATCH(req, { params }) {
  return withClient(params, (clientId) =>
    withTryCatch("Archive update failed", async () => {
      const { archived } = await req.json();          // boolean
      if (typeof archived !== "boolean")
        return apiError("`archived` must be a boolean.", 400);
      await setClientArchived(clientId, archived);
      return apiOk({ ok: true });
    }),
  );
}
```

### 4. UI

- **`src/app/page.tsx`** — fetch both `listClients()` and `listArchivedClients()`, pass both
  into `ClientsHomeTabs`.
- **`clients-home-tabs.tsx`** — add a third `TabsTrigger`/`TabsContent` "Archived"; reuse
  `ClientsTable` with a `variant`/`archived` prop so it renders the right row action and an
  empty-state card when there are none.
- **`clients-table.tsx`** — add a `⋯` row action menu (shadcn `dropdown-menu` from the Base UI
  registry — `render` prop, not `asChild`). Active rows show **Archive**; archived rows show
  **Unarchive**. The action `fetch`es the PATCH route, then `router.refresh()` to re-pull the
  server lists. Optimistic removal is a nice-to-have, not required for v1.

### Data flow

```
⋯ menu → Archive  ──PATCH /api/clients/[id] {archived:true}──▶ setClientArchived(id, true)
                                                              archived_at = now()
router.refresh() ──▶ listClients() drops it · listArchivedClients() includes it
⋯ menu → Unarchive ─PATCH {archived:false}─▶ archived_at = null  (reverse)
```

## Error handling

- Non-boolean `archived` body → `apiError(…, 400)`.
- Unknown client id → `withClient` returns 404 automatically.
- DB update failure → `withTryCatch` → `apiError("Archive update failed", 500)`.
- The action is idempotent: archiving an already-archived client just re-stamps `archived_at`.

## Testing (TDD)

- **`setClientArchived`** (mocked Supabase): archive sets a timestamp, unarchive sets null;
  targets the right `id`.
- **`listClients` / `listArchivedClients`**: filter correctly (active excludes archived; the
  archived list excludes active) and preserve the canvas-count mapping.
- **PATCH route**: 200 + `{ok:true}` for a valid boolean; 400 for a non-boolean body; 404 for
  an unknown id.
- **UI** (light): the `⋯` menu shows Archive on the Clients tab and Unarchive on the Archived
  tab.

## Implementation order (incremental)

1. **Migration + repo + tests** — `archived_at`, the three repo functions, unit tests. Runnable
   via SQL/script: archived clients vanish from `listClients`.
2. **PATCH route + test** — wire archive/unarchive over HTTP.
3. **UI** — Archived tab + `⋯` row action menu.

## Hard delete, for reference (NOT built in v1)

A future "Delete permanently" action would follow this sequence: **gather Storage paths →
remove blobs → delete the `clients` row** (Postgres `ON DELETE CASCADE` then wipes canvases →
nodes → node_versions, edges, KB docs/versions, brand images). The Storage cleanup must remove
blobs from four buckets — `client-logos`, `node-files`, `client-brand-images`, `kb-documents` —
**before** the row delete, because the cascade destroys the rows that hold those storage URLs.
That Storage step is the part Postgres can't do, and is why a raw SQL `DELETE` alone is
insufficient for permanent deletion (it would orphan every blob).
