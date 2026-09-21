# Market Live Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adding an Instagram handle takes its first snapshot immediately, and a clipped reel's tile updates on the open Market board the moment its archive finishes — no page reload.

**Architecture:** Fix 1 is server-side: the add-handle route calls the existing `snapshotHandle()` inline and reports the outcome on the 201. Fix 2 is a Supabase Realtime subscription on `moodboard_items` (new `org_id` column + org-isolation RLS policy + publication membership, migration 0040), consumed by an org-wide channel helper and a debounced hook — both direct clones of the `node_versions` pattern already in `src/lib/realtime/org-version-updates.ts` and `src/hooks/use-node-version-updates.ts`.

**Tech Stack:** Next.js (App Router, route handlers), Supabase (Postgres RLS, Realtime `postgres_changes`), Trigger.dev tasks (unchanged), vitest (node environment — no DOM, no testing-library; hooks are tested through exported pure functions), sonner toasts.

**Spec:** `docs/superpowers/specs/2026-09-21-market-live-updates-design.md`

## Global Constraints

- Every interactive control is a shadcn primitive from `src/components/ui/*` (never raw `<button>`, `<input>`); Base UI composes via `render`, not `asChild`.
- Route handlers use `apiOk` / `apiError` / `withClient` / `withTryCatch` from `src/lib/api/route-helpers.ts` — never `NextResponse.json`.
- Import, don't redefine: `snapshotHandle`, `getLatestSnapshot`, `addTrackedHandle`, `useIdentity`, `createBrowserSupabase` already exist. No local copies.
- Migrations are applied by hand in the Supabase SQL editor (staging, then production). `docs/auth-production-migration.md` is updated in the same task as the migration file.
- ADR entries go in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7, appended after D274 — never in a separate file.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Test environment is `node`; there is no `@testing-library/react`. Do not add it. Test hooks via exported pure functions.
- Debounce value for realtime-driven refetches is `400` ms (same as `use-node-version-updates.ts` and `use-review-list.ts`).
- Toast copy (verbatim):
  - no-data: `Instagram returned no data for @{handle} — private or misspelled? Use Refresh to try again.`
  - error: `Tracked @{handle}, but the first snapshot failed. Use Refresh to try again.`
- Dialog copy (verbatim): busy label `Fetching first snapshot…`; description `The client's own account or a competitor's — both work the same way. The first snapshot is taken now; history builds daily from there.`

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/0040_moodboard_items_realtime.sql` | **Create.** `org_id` column, backfill, trigger, `org isolation` policy, publication membership on `moodboard_items`. |
| `docs/auth-production-migration.md` | **Modify.** Append a "Migration 0040" section with verification SQL. |
| `src/lib/realtime/org-market-updates.ts` | **Create.** One shared Realtime channel per org for `moodboard_items` changes; hands listeners the changed row's `moodboard_id` or `null`. Exports pure `moodboardIdFromPayload`. |
| `src/lib/realtime/org-market-updates.test.ts` | **Create.** Tests for `moodboardIdFromPayload` and channel sharing/teardown. |
| `src/hooks/use-market-updates.ts` | **Create.** Subscribes for a set of board ids, filters, debounces, calls `onChange`. Exports pure `isBoardEvent`. |
| `src/hooks/use-market-updates.test.ts` | **Create.** Tests for `isBoardEvent`. |
| `src/hooks/use-market.ts` | **Modify.** Wire `useMarketUpdates` after load; update the `logArchiveState` doc comment. |
| `src/app/api/clients/[id]/performance/handles/route.ts` | **Modify.** POST takes the first snapshot inline, reports `snapshot` on the 201. |
| `src/app/api/clients/[id]/performance/handles/route.test.ts` | **Modify.** Four new POST cases. |
| `src/hooks/use-tracked-handles.ts` | **Modify.** `add()` return type carries `snapshot`. |
| `src/components/market/first-snapshot-notice.ts` | **Create.** Pure `firstSnapshotNotice(handle, snapshot)` → toast text or `null`. |
| `src/components/market/first-snapshot-notice.test.ts` | **Create.** Three cases. |
| `src/components/market/add-handle-dialog.tsx` | **Modify.** New copy, toast on non-ok snapshot. |
| `src/lib/market/snapshot.ts` | **Modify.** Header comment lists the real three callers. |
| `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` | **Modify.** Append D275, D276 to §7. |

---

### Task 1: Migration 0040 — `moodboard_items` joins Realtime

**Files:**
- Create: `supabase/migrations/0040_moodboard_items_realtime.sql`
- Modify: `docs/auth-production-migration.md` (append after the "Migration 0034" section at the end of the file)

**Interfaces:**
- Produces: `moodboard_items.org_id uuid` (always populated), `"org isolation"` SELECT policy, `moodboard_items` in the `supabase_realtime` publication. Task 2's channel filter `org_id=eq.<orgId>` depends on all three.

- [ ] **Step 1: Write the migration**

```sql
-- D276: moodboard_items joins Supabase Realtime so the Market board hears the archive
-- task (and any other writer) finish, instead of only learning on its own refetch.
--
-- The same four moves 0030 made for node_versions:
--   1. org_id — Realtime filters on one column; the browser needs one that scopes to an
--      org, and moodboard_items is two hops (moodboard → client → org) from having one.
--   2. A BEFORE INSERT trigger, not an assignment in addItem(): any insert path that
--      forgets the column produces a row no subscription ever hears about, and that
--      failure presents as "the tile just never updates" — the exact bug this fixes.
--   3. An org-isolation SELECT policy — 0026 enabled RLS with ZERO policies
--      (default-deny). Realtime delivers postgres_changes rows THROUGH RLS, so without
--      a policy the socket subscribes fine and receives nothing, silently. Writes are
--      unaffected: every API write goes through the service role.
--   4. Publication membership, guarded so the file is safe to re-run.

-- ── 1. org_id ────────────────────────────────────────────────────────────────
alter table moodboard_items add column if not exists org_id uuid references organizations(id);

-- 2-hop backfill: item -> moodboard -> client -> org.
update moodboard_items i set org_id = cl.org_id
  from moodboards m
  join clients cl on cl.id = m.client_id
 where m.id = i.moodboard_id
   and i.org_id is null;

create index if not exists moodboard_items_org_id_idx on moodboard_items(org_id);

-- ── 2. Trigger keeps it true for every future insert ─────────────────────────
create or replace function set_moodboard_item_org_id() returns trigger
language plpgsql as $$
begin
  if new.org_id is null then
    select cl.org_id into new.org_id
      from moodboards m
      join clients cl on cl.id = m.client_id
     where m.id = new.moodboard_id;
  end if;
  return new;
end;
$$;

drop trigger if exists moodboard_items_set_org_id on moodboard_items;
create trigger moodboard_items_set_org_id
  before insert on moodboard_items
  for each row execute function set_moodboard_item_org_id();

-- ── 3. RLS: required for Realtime delivery ───────────────────────────────────
-- Same shape as 0014 / 0030: a member reads their own org's rows only.
drop policy if exists "org isolation" on moodboard_items;
create policy "org isolation" on moodboard_items for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- ── 4. Publication (guarded — safe to re-run) ────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'moodboard_items'
  ) then
    alter publication supabase_realtime add table moodboard_items;
  end if;
end $$;
```

- [ ] **Step 2: Append the rollout section to the migration doc**

Append at the very end of `docs/auth-production-migration.md`:

```markdown
## Migration 0040 — `moodboard_items` Realtime (2026-09-21)

`supabase/migrations/0040_moodboard_items_realtime.sql`. Paste into the Supabase SQL editor → Run.
Same manual dashboard process as every other migration in this doc.

Adds to `moodboard_items`: `org_id` (backfilled 2-hop item→moodboard→client→org, plus a
BEFORE INSERT trigger to keep it true), an `org_id` index, an `org isolation` SELECT policy,
and membership of the `supabase_realtime` publication. This is what lets the Market board
hear the `archive-reference` task finish (D276).

**Why the policy matters:** `0026` enabled RLS on `moodboard_items` with zero policies
(default-deny). Realtime delivers `postgres_changes` rows *through* RLS, so the board's
subscription would silently receive nothing without it — the same failure `0018` fixed for
the Generation Tray and `0030` pre-empted for approvals. Writes still go through the
service role and are unaffected.

**Safe to re-run.** `add column if not exists`, `drop policy if exists`, `drop trigger if
exists`, and a `pg_publication_tables` existence check guard every non-idempotent statement.

**Ordering:** apply before deploying the app code. The app tolerates the migration landing
first (nothing reads `org_id` directly); it does not tolerate the reverse — the subscription
is silent until the policy and publication exist.

**Verify after running:**

```sql
-- expect 0 — every item should carry an org
select count(*) from moodboard_items where org_id is null;

-- expect 1 row
select policyname from pg_policies
 where tablename = 'moodboard_items' and policyname = 'org isolation';

-- expect 1 row
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'moodboard_items';
```

Application code that depends on this: `src/lib/realtime/org-market-updates.ts` (filters on
`org_id`) and `src/hooks/use-market-updates.ts`.
```

- [ ] **Step 3: Apply to staging and verify**

Paste the migration into the Supabase SQL editor for the **staging** project → Run. Then run the three verification queries above.
Expected: `0`, one row `org isolation`, one row `moodboard_items`.

(Production is applied at release time per the doc's ordering rule — not in this task.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0040_moodboard_items_realtime.sql docs/auth-production-migration.md
git commit -m "feat(db): moodboard_items joins Realtime — org_id, org isolation policy, publication (0040)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Org-wide Realtime channel for `moodboard_items`

**Files:**
- Create: `src/lib/realtime/org-market-updates.ts`
- Create: `src/lib/realtime/org-market-updates.test.ts`
- Reference (read, do not modify): `src/lib/realtime/org-version-updates.ts`

**Interfaces:**
- Consumes: `createBrowserSupabase()` from `@/lib/supabase/client`; migration 0040's `org_id` column.
- Produces:
  - `moodboardIdFromPayload(payload: { new?: unknown; old?: unknown }): string | null`
  - `subscribeToOrgMarketUpdates(orgId: string, onChange: (moodboardId: string | null) => void): () => void` — returns an unsubscribe function.

- [ ] **Step 1: Write the failing tests**

`src/lib/realtime/org-market-updates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// A minimal fake of the supabase browser client: records the postgres_changes
// registration so the test can both assert the filter and fire events into it.
type Handler = (payload: unknown) => void;
const registered: { config: Record<string, string>; handler: Handler }[] = [];
const removeChannel = vi.fn();
const channelFactory = vi.fn((_name: string) => {
  const ch = {
    on: (_ev: string, config: Record<string, string>, handler: Handler) => {
      registered.push({ config, handler });
      return ch;
    },
    subscribe: () => ch,
  };
  return ch;
});

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    channel: channelFactory,
    removeChannel,
  }),
}));

import { moodboardIdFromPayload, subscribeToOrgMarketUpdates } from "./org-market-updates";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("moodboardIdFromPayload", () => {
  it("reads new first (INSERT / UPDATE)", () => {
    expect(moodboardIdFromPayload({ new: { moodboard_id: "b1" }, old: {} })).toBe("b1");
  });

  it("falls back to old (DELETE)", () => {
    expect(moodboardIdFromPayload({ new: {}, old: { moodboard_id: "b2" } })).toBe("b2");
  });

  // Supabase sends `{}` for the unused side, not null — a `??` chain would not fall
  // through, so the helper must check each side explicitly.
  it("returns null when neither side identifies a row", () => {
    expect(moodboardIdFromPayload({ new: {}, old: {} })).toBeNull();
    expect(moodboardIdFromPayload({})).toBeNull();
  });
});

describe("subscribeToOrgMarketUpdates", () => {
  beforeEach(() => {
    registered.length = 0;
    channelFactory.mockClear();
    removeChannel.mockClear();
  });

  it("filters on org_id explicitly and fans one event out to every listener", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeToOrgMarketUpdates("org-1", a);
    const offB = subscribeToOrgMarketUpdates("org-1", b);
    await flush();

    expect(channelFactory).toHaveBeenCalledTimes(1);
    expect(registered[0].config).toMatchObject({
      table: "moodboard_items",
      filter: "org_id=eq.org-1",
      event: "*",
    });

    registered[0].handler({ new: { moodboard_id: "b1" }, old: {} });
    expect(a).toHaveBeenCalledWith("b1");
    expect(b).toHaveBeenCalledWith("b1");

    offA();
    expect(removeChannel).not.toHaveBeenCalled();
    offB();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/realtime/org-market-updates.test.ts`
Expected: FAIL — `Cannot find module './org-market-updates'`.

- [ ] **Step 3: Write the helper**

`src/lib/realtime/org-market-updates.ts`:

```ts
"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

// One shared Realtime channel per org for `moodboard_items` changes (D276) — the third
// sibling after org-generation-updates.ts and org-version-updates.ts, inheriting both
// of their hard-won lessons:
//
//   1. Filter on org_id EXPLICITLY. RLS alone silently drops postgres_changes rows; only
//      an explicit column filter reliably delivers them. moodboard_items could not be
//      filtered this way until migration 0040 added the column (and 0040's SELECT policy
//      is what lets any row through at all — 0026 left the table default-deny).
//   2. Await the session BEFORE subscribing. Subscribing first opens the websocket with no
//      JWT attached, so RLS evaluates auth.uid() as null and every row is dropped.
//
// event: "*" because every direction matters: UPDATE is the archive task flipping a row
// to `ready`, INSERT is a teammate (or the extension) clipping to a board you have open,
// DELETE is a removal.
//
// Subscribers get the changed row's moodboard_id and NOTHING ELSE. The row is withheld
// on purpose: consumers refetch the board from the server rather than patching a row
// into local state (D159). The id is a FILTER, not payload — the channel is org-wide, so
// without it one Market page would refetch every time anyone in the org clipped to any
// client's board. It is null when the event carries no identifiable row (a DELETE
// without REPLICA IDENTITY FULL), and consumers must treat null as "might be mine".
const channels = new Map<string, RealtimeChannel>();
const listeners = new Map<string, Set<(moodboardId: string | null) => void>>();
const pendingOrgIds = new Set<string>();

/** INSERT carries only `new`, DELETE only `old`, UPDATE both — and the unused side
 *  arrives as `{}`, not null, so `??` would never fall through. Check each side. */
export function moodboardIdFromPayload(payload: { new?: unknown; old?: unknown }): string | null {
  const newRow = payload.new as Record<string, unknown> | null | undefined;
  const oldRow = payload.old as Record<string, unknown> | null | undefined;
  if (typeof newRow?.moodboard_id === "string") return newRow.moodboard_id;
  if (typeof oldRow?.moodboard_id === "string") return oldRow.moodboard_id;
  return null;
}

export function subscribeToOrgMarketUpdates(
  orgId: string,
  onChange: (moodboardId: string | null) => void,
): () => void {
  if (!listeners.has(orgId)) listeners.set(orgId, new Set());
  listeners.get(orgId)!.add(onChange);

  if (!channels.has(orgId) && !pendingOrgIds.has(orgId)) {
    pendingOrgIds.add(orgId);
    const supabase = createBrowserSupabase();
    void supabase.auth.getSession().then(() => {
      pendingOrgIds.delete(orgId);
      if (!listeners.has(orgId)) return; // everyone unsubscribed before this resolved
      const channel = supabase
        .channel(`org-market-updates:${orgId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "moodboard_items",
            filter: `org_id=eq.${orgId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const moodboardId = moodboardIdFromPayload(payload);
            listeners.get(orgId)?.forEach((cb) => cb(moodboardId));
          },
        )
        .subscribe();
      channels.set(orgId, channel);
    });
  }

  return () => {
    const set = listeners.get(orgId);
    if (!set) return;
    set.delete(onChange);
    if (set.size === 0) {
      listeners.delete(orgId);
      const ch = channels.get(orgId);
      if (ch) {
        void createBrowserSupabase().removeChannel(ch);
        channels.delete(orgId);
      }
    }
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/realtime/org-market-updates.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/realtime/org-market-updates.ts src/lib/realtime/org-market-updates.test.ts
git commit -m "feat(market): org-wide Realtime channel for moodboard_items changes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `useMarketUpdates` hook, wired into `useMarket`

**Files:**
- Create: `src/hooks/use-market-updates.ts`
- Create: `src/hooks/use-market-updates.test.ts`
- Modify: `src/hooks/use-market.ts`
- Reference (read, do not modify): `src/hooks/use-node-version-updates.ts`

**Interfaces:**
- Consumes: `subscribeToOrgMarketUpdates(orgId, cb)` from Task 2; `useIdentity()` from `@/hooks/use-identity` (returns `{ orgId: string | null, … }`).
- Produces:
  - `isBoardEvent(boardIds: readonly string[], moodboardId: string | null): boolean`
  - `useMarketUpdates(boardIds: readonly string[], enabled: boolean, onChange: () => void): void`

- [ ] **Step 1: Write the failing test**

`src/hooks/use-market-updates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isBoardEvent } from "./use-market-updates";

const BOARDS = ["direct-1", "adjacent-1"];

describe("isBoardEvent", () => {
  it("accepts an event on either of this client's boards", () => {
    expect(isBoardEvent(BOARDS, "direct-1")).toBe(true);
    expect(isBoardEvent(BOARDS, "adjacent-1")).toBe(true);
  });

  // The channel is org-wide: another client's board changing must not refetch this page.
  it("ignores an event on a foreign board", () => {
    expect(isBoardEvent(BOARDS, "someone-elses-board")).toBe(false);
  });

  // A DELETE without REPLICA IDENTITY FULL carries no id. A redundant refetch is cheap;
  // a missed one leaves a removed tile on the shelf.
  it("treats an unidentifiable event as possibly mine", () => {
    expect(isBoardEvent(BOARDS, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/use-market-updates.test.ts`
Expected: FAIL — `Cannot find module './use-market-updates'`.

- [ ] **Step 3: Write the hook**

`src/hooks/use-market-updates.ts`:

```ts
"use client";

import { useEffect, useRef } from "react";
import { useIdentity } from "./use-identity";
import { subscribeToOrgMarketUpdates } from "@/lib/realtime/org-market-updates";

// Coalesces a burst of writes into one refresh. One archive is three UPDATEs on the same
// row — claim, complete, thumbnail backfill — and a batch clip from the extension is N
// INSERTs. Same value use-node-version-updates.ts and use-review-list.ts use.
const REFRESH_DEBOUNCE_MS = 400;

/** Pure so the org-wide → this-page filter can be tested without rendering. `null`
 *  means the event carried no identifiable row and is treated as "might be mine". */
export function isBoardEvent(boardIds: readonly string[], moodboardId: string | null): boolean {
  return moodboardId === null || boardIds.includes(moodboardId);
}

// D276 — keep an OPEN Market board live: when the archive task flips a tile to `ready`,
// a teammate clips to the board, or the nightly sweep repairs a thumbnail, the shelf
// updates in place instead of waiting for the next addReference refetch.
//
// The underlying channel is ORG-WIDE (one per org, so channel count stays flat). The
// board-id filter is what turns "anyone in the org clipped anything" into "one of the
// two boards on this page changed".
export function useMarketUpdates(
  boardIds: readonly string[],
  enabled: boolean,
  onChange: () => void,
) {
  const { orgId } = useIdentity();

  // Ref so useMarket can pass its `refresh` directly without the subscription being torn
  // down whenever that callback's identity changes. Written in an effect, never in render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Stable dependency: a new array literal each render must not resubscribe.
  const boardKey = boardIds.join("|");

  useEffect(() => {
    if (!enabled || !orgId || boardKey === "") return;
    const ids = boardKey.split("|");

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToOrgMarketUpdates(orgId, (moodboardId) => {
      if (!isBoardEvent(ids, moodboardId)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), REFRESH_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, orgId, boardKey]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/use-market-updates.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Wire it into `useMarket`**

In `src/hooks/use-market.ts`:

Replace the import line:
```ts
import { useCallback, useEffect, useState } from "react";
```
with:
```ts
import { useCallback, useEffect, useState } from "react";
import { useMarketUpdates } from "./use-market-updates";
```

Replace the `logArchiveState` doc comment (the block starting `/**` and ending `*/` immediately above `function logArchiveState`) with:
```ts
/**
 * Prints the archive backlog to the browser console on every board refetch.
 *
 * The board now refetches on Realtime events too (D276), so this fires whenever the
 * archive task touches a row — which makes it the quickest way to tell "the task ran
 * and is working" from "nothing is listening": both leave the tile looking finished,
 * but only one prints a status change here.
 *
 * `attempts: 0` across the board is the signature of the task never having been
 * reached at all — usually `npm run dev:trigger` not running.
 */
```

Immediately after the initial-fetch `useEffect` (the one that calls `void refresh()`), add:
```ts
  // D276 — refetch when the archive task, a teammate, or the sweep changes a row on one
  // of this client's two boards. Enabled only once we know the board ids.
  useMarketUpdates(
    data ? [data.direct.board.id, data.adjacent.board.id] : [],
    data !== null,
    refresh,
  );
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/hooks/use-market.ts src/hooks/use-market-updates.ts`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-market-updates.ts src/hooks/use-market-updates.test.ts src/hooks/use-market.ts
git commit -m "feat(market): board refetches on moodboard_items Realtime events

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Add-handle route takes the first snapshot inline

**Files:**
- Modify: `src/app/api/clients/[id]/performance/handles/route.ts:17-34`
- Modify: `src/app/api/clients/[id]/performance/handles/route.test.ts`
- Modify: `src/lib/market/snapshot.ts:1-4` (header comment only)
- Modify: `src/lib/market/performance.ts` (add one exported type at the end of the file)

**Interfaces:**
- Consumes: `addTrackedHandle(clientId, handle): Promise<TrackedHandleRow>`, `getLatestSnapshot(clientId, handle): Promise<AccountSnapshotRow | null>` from `@/lib/db/performance`; `snapshotHandle(clientId, handle): Promise<{ ok: true; handle; postCount } | { ok: false; reason: "no-data" }>` from `@/lib/market/snapshot`.
- Produces: `export type FirstSnapshotOutcome = "ok" | "no-data" | "error"` in `src/lib/market/performance.ts`; `POST` responds `201 { handle: TrackedHandleRow, snapshot: FirstSnapshotOutcome }`. Task 5's hook reads `snapshot`.

- [ ] **Step 1: Write the failing tests**

In `src/app/api/clients/[id]/performance/handles/route.test.ts`:

Replace the `@/lib/db/performance` mock block:
```ts
vi.mock("@/lib/db/performance", () => ({
  listTrackedHandles: vi.fn(),
  addTrackedHandle: vi.fn(),
}));

import { listTrackedHandles, addTrackedHandle } from "@/lib/db/performance";
```
with:
```ts
vi.mock("@/lib/db/performance", () => ({
  listTrackedHandles: vi.fn(),
  addTrackedHandle: vi.fn(),
  getLatestSnapshot: vi.fn(),
}));
vi.mock("@/lib/market/snapshot", () => ({
  snapshotHandle: vi.fn(),
}));

import { listTrackedHandles, addTrackedHandle, getLatestSnapshot } from "@/lib/db/performance";
import { snapshotHandle } from "@/lib/market/snapshot";
```

Then add these cases inside the existing `describe("POST /api/clients/[id]/performance/handles", …)` block, after the `"rejects a missing handle"` test:

```ts
  // D275 — the row saves first and always; the snapshot is the first day's data.
  describe("first snapshot (D275)", () => {
    beforeEach(() => {
      vi.mocked(addTrackedHandle).mockResolvedValue(ROW);
    });

    it("takes the first snapshot inline for a fresh handle", async () => {
      vi.mocked(getLatestSnapshot).mockResolvedValue(null);
      vi.mocked(snapshotHandle).mockResolvedValue({ ok: true, handle: "prakritisattva", postCount: 12 });
      const { POST } = await import("./route");
      const res = await POST(postReq({ handle: "prakritisattva" }) as never, { params });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ handle: ROW, snapshot: "ok" });
      expect(vi.mocked(snapshotHandle)).toHaveBeenCalledWith("client-1", "prakritisattva");
    });

    // Unenrolling keeps history (D253), so re-adding must not spend a result charge.
    it("skips the snapshot when history already exists", async () => {
      vi.mocked(getLatestSnapshot).mockResolvedValue({ id: "s1" } as never);
      const { POST } = await import("./route");
      const res = await POST(postReq({ handle: "prakritisattva" }) as never, { params });
      expect(res.status).toBe(201);
      expect((await res.json()).snapshot).toBe("ok");
      expect(vi.mocked(snapshotHandle)).not.toHaveBeenCalled();
    });

    it("reports no-data without failing the add", async () => {
      vi.mocked(getLatestSnapshot).mockResolvedValue(null);
      vi.mocked(snapshotHandle).mockResolvedValue({ ok: false, reason: "no-data" });
      const { POST } = await import("./route");
      const res = await POST(postReq({ handle: "prakritisattva" }) as never, { params });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ handle: ROW, snapshot: "no-data" });
    });

    it("reports error without failing the add when the provider throws", async () => {
      vi.mocked(getLatestSnapshot).mockResolvedValue(null);
      vi.mocked(snapshotHandle).mockRejectedValue(new Error("Apify request failed: HTTP 402"));
      const { POST } = await import("./route");
      const res = await POST(postReq({ handle: "prakritisattva" }) as never, { params });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ handle: ROW, snapshot: "error" });
    });
  });
```

Also update the two existing POST tests that only mock `addTrackedHandle` — they now reach `getLatestSnapshot`, which `vi.resetAllMocks()` leaves returning `undefined`. `undefined` is falsy, so `snapshotHandle` (also `undefined` → returns `undefined`) would be awaited and `.ok` read off `undefined`. Add to each of `"canonicalizes the handle before storing it"` and `"accepts a pasted profile URL"`, right after their `addTrackedHandle` mock line:
```ts
    vi.mocked(getLatestSnapshot).mockResolvedValue({ id: "s1" } as never);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/clients/[id]/performance/handles/route.test.ts"`
Expected: FAIL — the four new cases: response body lacks `snapshot` / `snapshotHandle` not called.

- [ ] **Step 3: Implement the route change**

Append to the end of `src/lib/market/performance.ts` (pure, client-safe — both the route and the dialog already import from it):

```ts
/** What the add-handle route reports about the inline first snapshot (D275). The row
 *  is saved in every case; this only says whether day one's data exists yet. */
export type FirstSnapshotOutcome = "ok" | "no-data" | "error";
```

Replace the whole `POST` handler and the imports in `src/app/api/clients/[id]/performance/handles/route.ts`:

```ts
import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { listTrackedHandles, addTrackedHandle, getLatestSnapshot } from "@/lib/db/performance";
import { parseInstagramHandle, type FirstSnapshotOutcome } from "@/lib/market/performance";
import { snapshotHandle } from "@/lib/market/snapshot";
```

(keep the existing `GET` handler exactly as is), then:

```ts
/** Enrols a handle. Canonicalizes first, so `@Foo`, `foo` and a pasted profile URL all
 *  become one row — and so the value stored is the one the scraper will request.
 *
 *  Then takes the first snapshot inline (D275): the user typed the handle and clicked
 *  Track, and the only thing the old "First snapshot pending — Refresh" empty state
 *  achieved was a second click. The row saves first and always; the snapshot outcome
 *  rides along on the 201 and never turns a successful add into an error. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not add that handle.", async () => {
      const body = (await req.json().catch(() => null)) as { handle?: unknown } | null;
      const raw = typeof body?.handle === "string" ? body.handle : null;
      const handle = parseInstagramHandle(raw);
      if (!handle) {
        return apiError("That doesn't look like an Instagram handle.", 400);
      }
      // addTrackedHandle upserts, so a double-submitted dialog returns the existing
      // row rather than failing on the unique key.
      const row = await addTrackedHandle(clientId, handle);
      const snapshot = await takeFirstSnapshot(clientId, handle);
      return apiOk({ handle: row, snapshot }, 201);
    }),
  );
}

// Skips the re-add case: unenrolling keeps history (D253), so a handle that already has
// snapshots must not spend a result charge just for coming back.
async function takeFirstSnapshot(clientId: string, handle: string): Promise<FirstSnapshotOutcome> {
  try {
    if (await getLatestSnapshot(clientId, handle)) return "ok";
    const result = await snapshotHandle(clientId, handle);
    return result.ok ? "ok" : "no-data";
  } catch (e) {
    console.error(`[performance] first snapshot failed for @${handle}:`, e);
    return "error";
  }
}
```

- [ ] **Step 4: Fix the stale header comment in `snapshot.ts`**

Replace lines 1–4 of `src/lib/market/snapshot.ts`:
```ts
// The one snapshot path all three callers use (daily trigger sweep, manual refresh
// route, and a newly added handle's first fetch), mirroring ingestReference's contract:
// the SNAPSHOT always saves; thumbnails are best-effort decoration (D185's spirit).
// Only a DB/provider failure propagates.
```
with:
```ts
// The one snapshot path all three callers use — the daily trigger sweep
// (trigger/snapshot-handles.ts), the manual refresh route, and the add-handle route's
// inline first fetch (D275) — mirroring ingestReference's contract: the SNAPSHOT always
// saves; thumbnails are best-effort decoration (D185's spirit). Only a DB/provider
// failure propagates.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/clients/[id]/performance/handles/route.test.ts" src/lib/market/snapshot.test.ts`
Expected: PASS — all cases (the file previously had 7; now 11).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/clients/[id]/performance/handles/route.ts" "src/app/api/clients/[id]/performance/handles/route.test.ts" src/lib/market/snapshot.ts src/lib/market/performance.ts
git commit -m "feat(performance): adding a handle takes its first snapshot inline (D275)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Dialog reports the first-snapshot outcome

**Files:**
- Create: `src/components/market/first-snapshot-notice.ts`
- Create: `src/components/market/first-snapshot-notice.test.ts`
- Modify: `src/hooks/use-tracked-handles.ts:31-48`
- Modify: `src/components/market/add-handle-dialog.tsx`

**Interfaces:**
- Consumes: Task 4's `201 { handle, snapshot }` body and `FirstSnapshotOutcome` from `@/lib/market/performance`.
- Produces:
  - `firstSnapshotNotice(handle: string, snapshot: FirstSnapshotOutcome): string | null`
  - `useTrackedHandles().add(raw): Promise<{ handle: string; snapshot: FirstSnapshotOutcome } | { error: string }>`
  - `AddHandleDialog` prop `onAdd` has the same new return type.

- [ ] **Step 1: Write the failing test**

`src/components/market/first-snapshot-notice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { firstSnapshotNotice } from "./first-snapshot-notice";

describe("firstSnapshotNotice", () => {
  it("is silent on success — the data is the notice", () => {
    expect(firstSnapshotNotice("acme", "ok")).toBeNull();
  });

  it("names the likely causes when Instagram returned nothing", () => {
    expect(firstSnapshotNotice("acme", "no-data")).toBe(
      "Instagram returned no data for @acme — private or misspelled? Use Refresh to try again.",
    );
  });

  it("says the handle IS tracked when the fetch failed", () => {
    expect(firstSnapshotNotice("acme", "error")).toBe(
      "Tracked @acme, but the first snapshot failed. Use Refresh to try again.",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/market/first-snapshot-notice.test.ts`
Expected: FAIL — `Cannot find module './first-snapshot-notice'`.

- [ ] **Step 3: Write the helper**

`src/components/market/first-snapshot-notice.ts`:

```ts
import type { FirstSnapshotOutcome } from "@/lib/market/performance";

/**
 * Toast copy for a non-ok first snapshot (D275). Pure and separate from the dialog so
 * the copy is testable without rendering. In both non-ok cases the handle IS tracked —
 * the dialog closes and the sub-tab opens on its "First snapshot pending" state, which
 * is where the Refresh the copy points at lives.
 */
export function firstSnapshotNotice(handle: string, snapshot: FirstSnapshotOutcome): string | null {
  if (snapshot === "ok") return null;
  if (snapshot === "no-data") {
    return `Instagram returned no data for @${handle} — private or misspelled? Use Refresh to try again.`;
  }
  return `Tracked @${handle}, but the first snapshot failed. Use Refresh to try again.`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/market/first-snapshot-notice.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Surface `snapshot` from the hook**

In `src/hooks/use-tracked-handles.ts`, add the import after the `authFetch` import:
```ts
import type { FirstSnapshotOutcome } from "@/lib/market/performance";
```

Replace the `add` callback:
```ts
  /** Returns the canonical handle on success, or an error message to show inline. */
  const add = useCallback(
    async (raw: string): Promise<{ handle: string } | { error: string }> => {
      const res = await authFetch(`/api/clients/${clientId}/performance/handles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: raw }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return { error: body?.error ?? "Could not add that handle." };
      }
      const { handle } = (await res.json()) as { handle: TrackedHandle };
      await load();
      return { handle: handle.handle };
    },
    [clientId, load],
  );
```
with:
```ts
  /** Returns the canonical handle and the first-snapshot outcome (D275) on success, or
   *  an error message to show inline. A non-ok snapshot is NOT an error here — the
   *  handle is tracked; only the first day's data is missing. */
  const add = useCallback(
    async (
      raw: string,
    ): Promise<{ handle: string; snapshot: FirstSnapshotOutcome } | { error: string }> => {
      const res = await authFetch(`/api/clients/${clientId}/performance/handles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: raw }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return { error: body?.error ?? "Could not add that handle." };
      }
      const { handle, snapshot } = (await res.json()) as {
        handle: TrackedHandle;
        snapshot: FirstSnapshotOutcome;
      };
      await load();
      return { handle: handle.handle, snapshot };
    },
    [clientId, load],
  );
```

- [ ] **Step 6: Update the dialog**

In `src/components/market/add-handle-dialog.tsx`:

Add imports after the `Loader2` import:
```ts
import { toast } from "sonner";
import type { FirstSnapshotOutcome } from "@/lib/market/performance";
import { firstSnapshotNotice } from "./first-snapshot-notice";
```

Replace the `onAdd` prop type:
```ts
  /** Resolves to the canonical handle, or an error message to show on the field. */
  onAdd: (raw: string) => Promise<{ handle: string } | { error: string }>;
```
with:
```ts
  /** Resolves to the canonical handle plus the first-snapshot outcome, or an error
   *  message to show on the field. */
  onAdd: (
    raw: string,
  ) => Promise<{ handle: string; snapshot: FirstSnapshotOutcome } | { error: string }>;
```

Replace the tail of `save()`:
```ts
    onAdded(result.handle);
    close();
```
with:
```ts
    // The handle is tracked either way (D275) — a missing first snapshot is a notice,
    // not a reason to keep the dialog open.
    const notice = firstSnapshotNotice(result.handle, result.snapshot);
    if (notice) toast.warning(notice, { duration: 8000 });
    onAdded(result.handle);
    close();
```

Replace the description:
```tsx
          <DialogDescription>
            The client&apos;s own account or a competitor&apos;s — both work the same way.
            Snapshots start from today; history builds as they run.
          </DialogDescription>
```
with:
```tsx
          <DialogDescription>
            The client&apos;s own account or a competitor&apos;s — both work the same way.
            The first snapshot is taken now; history builds daily from there.
          </DialogDescription>
```

Replace the busy label:
```tsx
            {busy ? "Adding…" : "Track handle"}
```
with:
```tsx
            {busy ? "Fetching first snapshot…" : "Track handle"}
```

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/hooks/use-tracked-handles.ts src/components/market/add-handle-dialog.tsx src/components/market/first-snapshot-notice.ts`
Expected: no output (clean). `performance-view.tsx` passes `add` straight through as `onAdd`, so the widened type flows without edits there.

- [ ] **Step 8: Commit**

```bash
git add src/components/market/first-snapshot-notice.ts src/components/market/first-snapshot-notice.test.ts src/hooks/use-tracked-handles.ts src/components/market/add-handle-dialog.tsx
git commit -m "feat(performance): add-handle dialog waits on, and reports, the first snapshot

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: ADR entries D275 and D276

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` — insert immediately after the D274 entry (the `### D274 — The voiceover is written into every multishot beat…` block, ending before the next `###` heading). Note the file has a duplicated `D270`–`D273` block further down from a merge; leave it alone and number these D275/D276.

- [ ] **Step 1: Append the two entries**

Insert after D274's last paragraph:

```markdown
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
SELECT policy and membership of `supabase_realtime` (migration 0040). The Market board holds
one org-wide channel and refetches, debounced 400 ms, when a row on one of its two boards
changes. The tile chip is unchanged and still derived from the fetched snapshot; D269's
recency gate on backlog `pending` rows stands.

**Why.** D269 declined Realtime as "the first-ever RLS policy on the market tables — a
security change." That was accurate and is no longer a reason: 0014, 0022 and 0030 have
since made `org_id` + org-isolation policy + publication membership the house pattern for
every table a browser watches, and `moodboard_items` was the only live-updated table not on
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
```

- [ ] **Step 2: Mark D269 as superseded in its heading**

Change:
```markdown
### D269 — No realtime and no polling in Market *(recorded 2026-09-11)*
```
to:
```markdown
### D269 — No realtime and no polling in Market *(recorded 2026-09-11; Realtime half superseded by D276, polling rejection stands)*
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D275 first snapshot on add, D276 Market Realtime (supersedes D269)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Verify end to end

**Files:** none modified.

- [ ] **Step 1: Full checks**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint && npx vitest run src/lib/realtime src/hooks src/components/market src/lib/market "src/app/api/clients/[id]/performance"`
Expected: typecheck clean, lint clean, all listed test directories pass. (The full `vitest run` has known unrelated timeout flakes in API route tests; verify per-directory as above.)

- [ ] **Step 2: Run the app against staging and verify Fix 1**

Precondition: migration 0040 applied to staging (Task 1 Step 3); `APIFY_TOKEN` in `.env.staging`.

Run: `npm run env:staging` in one terminal, `npm run dev:trigger` in another.

1. Open a client → Market → Performance → **Add handle** → enter a public handle → Track.
2. Expected: button reads "Fetching first snapshot…" for several seconds; dialog closes; the new sub-tab is selected and shows stat cards and post tiles — no Refresh click.
3. Enter a nonsense handle (e.g. `zzqqxx_notreal_handle_1234`) → Track.
4. Expected: dialog closes; a warning toast reads `Instagram returned no data for @zzqqxx_notreal_handle_1234 — private or misspelled? Use Refresh to try again.`; the sub-tab shows "First snapshot pending". Remove it afterwards.

- [ ] **Step 3: Verify Fix 2**

1. Market → Direct → **Add Direct reference** → paste an Instagram reel URL → Add.
2. Expected: tile appears with a "Syncing" chip. Open the browser console: `[archive] newest: instagram pending attempts=0 media=none`.
3. Wait 20–60 s **without reloading**.
4. Expected: the console prints a new `[archive] newest: instagram ready attempts=1 media=stored` line on its own (the Realtime-driven refetch), and the chip disappears. Clicking the tile opens the lightbox on our archived video.
5. In a second browser tab on the same page, remove the reference. Expected: the first tab's shelf drops the tile within ~1 s.

- [ ] **Step 4: Report**

State what passed and what did not, with the console lines. If Step 3.4 never prints the second `[archive]` line, check in order: the three verification queries from Task 1 against staging; that `dev:trigger` is running (`attempts=0` forever is the tell); the browser console for a `CHANNEL_ERROR` from Supabase.
