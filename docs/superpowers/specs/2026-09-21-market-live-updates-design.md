# Market live updates — first snapshot on add, Realtime archive state

**Date:** 2026-09-21
**Status:** approved design, awaiting plan
**Fixes:** two QA findings on the Market page (Performance tab, Direct/Adjacent shelves)
**Supersedes:** D269 (no realtime in Market); amends `2026-09-03-handle-performance-design.md` §5

## 1. The two findings

**F1 — Adding a handle does not fetch anything.** `POST /api/clients/[id]/performance/handles`
inserts the `tracked_handles` row and returns. The sub-tab then reads "First snapshot pending
for @handle — Refresh to fetch it." until the user clicks Refresh or the 05:00 sweep runs.
That empty state was specified (handle-performance design §5), but the header comment in
`src/lib/market/snapshot.ts` lists "a newly added handle's first fetch" as a caller that was
never wired — the intent was mixed, and in use it reads as broken.

**F2 — A clipped reel never updates.** `archive-reference` (Trigger.dev) writes
`archive_status = ready` and `media_url` straight to Supabase, but the Market board only
refetches after its own `addReference`. The "Syncing" chip therefore stays until the user
reloads the page. This is D269 working as recorded; the user's expectation is that it should
not have been recorded that way.

## 2. Fix 1 — the first snapshot fires inline on add

> **Revised 2026-09-21, same day.** The first cut ran the scrape inside the add request,
> holding the dialog on a "Fetching first snapshot…" spinner for ~10 s. Operator feedback:
> it looks blocking. The wait now lives on the new sub-tab. What follows is the shipped
> design.

### Server — `src/app/api/clients/[id]/performance/handles/route.ts` (POST)

**Unchanged: a fast insert.** `addTrackedHandle(clientId, handle)` → `201 { handle: row }`.
The route's doc comment states that it deliberately does not snapshot, and a test guards
that `snapshotHandle` is never called from it.

### Client

- `src/components/market/performance-view.tsx` — holds `firstFetch: string | null`. The
  dialog's `onAdded(handle)` sets both `selected` and `firstFetch`. `HandlePerformance`
  receives `fetchFirst={firstFetch === selected}` and `onFirstFetchDone={() => setFirstFetch(null)}`.
- `src/components/market/handle-performance.tsx`
  - New optional props `fetchFirst` / `onFirstFetchDone`.
  - An effect, guarded by a `useRef` so it runs once per mount, waits for the initial load
    and then: if `data.latest` exists (a re-added handle with history — D253) calls
    `onFirstFetchDone()` and stops; otherwise calls the hook's existing `refresh()`, stores
    its error string in the existing `refreshError` state, and calls `onFirstFetchDone()`.
  - The "no snapshot yet" panel now has two states: while `refreshing` — a spinning
    `RefreshCw` in primary and "Fetching the first snapshot for @handle — about ten
    seconds."; otherwise the original "First snapshot pending … Refresh to fetch it now"
    copy.
  - No-data (`409 Instagram returned no data for this handle.`) and provider errors come
    back from the refresh route and show inline beside the Refresh button, exactly as a
    manual refresh's errors already do. No toast.
- `src/components/market/add-handle-dialog.tsx` — closes on the 201; busy label stays
  "Adding…". Description becomes "The first snapshot is taken now; history builds daily
  from there."
- `src/hooks/use-tracked-handles.ts` — unchanged.
- `src/lib/market/snapshot.ts` — header comment corrected: the callers are the daily sweep
  and the refresh route (which the client also fires for a just-added handle).

### Tests

- Route (`handles/route.test.ts`): one added case — `POST` returns `201 { handle }` and
  `snapshotHandle` is not called.
- The mount-time fetch is React effect logic with no pure core to extract; it is verified
  by the manual walkthrough in the plan's Task 7 (vitest here is `node`-only, no
  testing-library).

## 3. Fix 2 — the board subscribes to `moodboard_items` via Supabase Realtime

### Migration `supabase/migrations/0040_moodboard_items_realtime.sql`

The same four moves 0030 made for `node_versions`, on `moodboard_items`:

1. `alter table moodboard_items add column org_id uuid references organizations(id);`
   Two-hop backfill: `moodboard_items.moodboard_id → moodboards.client_id → clients.org_id`.
   `create index moodboard_items_org_id_idx on moodboard_items(org_id);`
2. `before insert` trigger `set_moodboard_item_org_id()` fills `org_id` when null, resolving
   through the same two hops. A trigger rather than a change to `addItem()`: any insert path
   that forgets the column produces a row no subscription ever hears about, and that failure
   presents as "the tile just never updates" — indistinguishable from F2 itself.
3. `"org isolation"` SELECT policy:
   `using (org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1))`.
   `0026` enabled RLS on `moodboard_items` with zero policies; Realtime delivers rows
   *through* RLS, so without this the socket subscribes successfully and receives nothing.
   Writes are unaffected — every API write already goes through the service role.
4. Guarded `alter publication supabase_realtime add table moodboard_items`
   (`pg_publication_tables` existence check, as 0030).

`drop policy if exists` + the publication guard make the file safe to re-run.

**Rollout:** paste into the Supabase SQL editor on staging, then production, before deploying
the app code (the app tolerates the migration landing first — nothing reads `org_id` — but
the subscription is silent until it lands). `docs/auth-production-migration.md` gets a
"Migration 0040" section in the same session, following the 0030 section's shape, with
these verifications:

```sql
select count(*) from moodboard_items where org_id is null;              -- expect 0
select policyname from pg_policies
 where tablename = 'moodboard_items' and policyname = 'org isolation';  -- expect 1
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'moodboard_items'; -- expect 1
```

### Client

**`src/lib/realtime/org-market-updates.ts`** — sibling of `org-version-updates.ts`, same
module-level channel/listener maps, same two lessons (explicit `org_id` filter; await the
session before subscribing). `event: "*"` on `moodboard_items`, `filter: org_id=eq.${orgId}`.
Listeners receive the changed row's `moodboard_id` (from `new`, else `old`, else `null`) and
nothing else — consumers refetch, they never patch (D159's rule, as the sibling states it).

**`src/hooks/use-market-updates.ts`** — sibling of `use-node-version-updates.ts`:

```ts
export function useMarketUpdates(boardIds: string[], enabled: boolean, onChange: () => void)
```

Subscribes via `useIdentity().orgId`; ignores events whose `moodboard_id` is a string not in
`boardIds`; treats `null` as "might be mine"; coalesces bursts with the same 400 ms debounce
the siblings use (one archive is three UPDATEs — claim, complete, thumbnail). `onChange` is
held in a ref so `useMarket`'s `refresh` can be passed directly.

**`src/hooks/use-market.ts`** — after the initial load, calls
`useMarketUpdates([direct.board.id, adjacent.board.id], data !== null, refresh)`. The
`logArchiveState` helper stays (it is still the right console signal for "is the task
running at all") but its doc comment no longer claims there is no realtime channel.

Nothing else changes: `reference-tile.tsx`, `archive-chip.tsx`, `ingest.ts`, both reference
routes and the extension path are untouched. The chip's recency gate on `pending` (D269's
second half) still applies and is still correct — the refetch is what flips `ready`.

### What this also fixes

The board updates when a teammate clips to it, when the extension clips to it, and when the
nightly sweep repairs a tile while the tab is open. None of these were reachable by the
Trigger.dev Realtime alternative (§5).

### Tests

- `use-market-updates.test.ts` — mock `subscribeToOrgMarketUpdates` and `useIdentity`:
  refetch fires for a matching board id and for `null`; not for a foreign board id; three
  events inside 400 ms produce one refetch; unsubscribe on unmount and when `enabled` flips
  false.
- `org-market-updates.test.ts` — mock `createBrowserSupabase`: two subscribers share one
  channel; the channel is removed on the last unsubscribe; `moodboard_id` is read from `new`
  then `old` then `null`.
- `use-market.test.ts` (new or extended) — `useMarketUpdates` is called with both board ids
  once data has loaded, and not before.

## 4. Decisions (append to roadmap §7)

### D275 — Adding a handle takes its first snapshot inline *(recorded 2026-09-21; refines D252, D253; amends handle-performance §5)*

**Decision.** `POST …/performance/handles` runs `snapshotHandle` before responding when the
handle has no snapshot yet. The row saves first and always; the snapshot outcome is reported
as `snapshot: ok | no-data | error` on the 201, never as a failure of the add.

**Why.** D252 made enrolment a deliberate, visible, paid act — and it still is: the user
typed the handle and clicked Track. What was not deliberate was the second click the design
then demanded, on a Refresh button, to see anything at all. The empty state was written to
cover the gap between add and the 05:00 sweep; the gap itself has no purpose. One result
charge at add time is the same charge the sweep would have made that night.

**Rejected.** A background Trigger task for the first fetch (adds the "how does the UI learn
it finished" problem for a ~9 s wait a dialog spinner covers); keeping the manual Refresh as
the primary CTA (does not fix the finding); rolling the row back on `no-data` (the handle may
be temporarily blocked — D253 keeps history on unenrol for the same reason).

**Originated →** `2026-09-21-market-live-updates-design.md` §2.

### D276 — Market subscribes to `moodboard_items` through Supabase Realtime *(recorded 2026-09-21; supersedes D269)*

**Decision.** `moodboard_items` gains `org_id` (trigger-maintained), an `org isolation`
SELECT policy and membership of `supabase_realtime`. The Market board holds one org-wide
channel and refetches, debounced, when a row on one of its two boards changes. The tile chip
is unchanged and still derived from the fetched snapshot; D269's recency gate on backlog
`pending` rows stands.

**Why.** D269 declined Realtime as "the first-ever RLS policy on the market tables — a
security change." That was accurate and is no longer a reason: 0014, 0022 and 0030 have
since made `org_id` + org-isolation policy + publication membership the house pattern for
every table a browser watches, and `moodboard_items` is the only live-updated table not on
it. The alternative — subscribing to the Trigger.dev run — covers only the clip this browser
made in this session; it cannot see a colleague's clip, an extension clip, or a sweep repair.
The finding is "the tile does not update"; only a table subscription answers it for every
writer.

**Rejected.** Interval polling (still rejected — a socket that is silent when nothing changes
beats a timer that is not); Trigger.dev Realtime on the run id (partial coverage, new
dependency, token minting per clip); a `client_id` column and per-client channel (a second
denormalised column to maintain when the org channel plus a board-id filter costs nothing —
one open Market page is one channel either way).

**Refines.** D185, D264, D269 (superseded).

**Originated →** `2026-09-21-market-live-updates-design.md` §3.

## 5. Alternatives considered for F2

| | Supabase Realtime (chosen) | Trigger.dev Realtime | Targeted polling |
|---|---|---|---|
| Covers | every writer | this browser's clips only | every writer |
| DB change | 0040 (pattern of 0030) | none | none |
| Client | helper + hook clones | new dep, token per clip, run bookkeeping | timer in `useMarket` |
| Idle cost | none | none | none (only while in-flight) |
| Why not | — | partial coverage | a timer where a socket exists |

## 6. Out of scope

- Autoplay-on-hover for archived video tiles (enhancement, separate ticket).
- Live updates on the Performance tab itself (snapshots are daily; Refresh is the manual
  path and already refetches).
- The extension's response shape.
