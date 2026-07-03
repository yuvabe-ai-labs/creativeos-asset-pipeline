# Canvas pessimistic lock (single-writer editing)

**Date:** 2026-07-01
**Status:** Design approved; ready for implementation plan
**Supersedes:** D32's optimistic-merge autosave (retired — see §7)
**New ADR entry:** D33
**Touches:** `supabase/migrations/0010_*.sql`, `src/lib/db/canvas-lock.ts` (new),
`src/lib/actions/canvas-lock.ts` (new), `src/lib/canvas/lock-state.ts` (new, pure),
`src/hooks/use-canvas-lock.ts` (new), `src/lib/actions/nodes.ts` (`saveCanvasAction`),
`src/components/canvas/canvas-autosave.tsx`, `src/components/canvas/canvas.tsx`,
`src/lib/canvas-store.ts` (drop `replaceCanvas`), `src/app/clients/[id]/canvases/[cid]/page.tsx`
(drop the dead `initialUpdatedAt` prop; the `<IdentityGate>` there already guarantees identity),
`src/app/api/canvases/[cid]/lock/release/route.ts` (new).

**Depends on:** the D29 identity system (already on this branch: `useIdentity`, `IdentityGate`,
migration `0009_approval_flag.sql`). See §6.4 for how the lock composes with approval/generation.

---

## 1. Problem

D31 (non-destructive saves) + D32 (optimistic `updated_at` token with save-mine-then-merge)
shipped to `main`, but two concurrent sessions/tabs break it:

- **Position oscillation loop.** On a detected conflict, autosave calls `replaceCanvas(fresh)`,
  which swaps the store's `nodes` array; the `storeApi.subscribe` in `canvas-autosave.tsx` sees
  the change and schedules *another* save. Two sessions ping-pong forever; positions oscillate.
- **Deleted nodes resurrected.** D32 limitation (b): each session upserts its full snapshot, so
  the session still holding a node the other deleted upserts it back.

Root cause: mine-wins full-snapshot + merge-on-conflict cannot give clean concurrent editing.
The fix is to **prevent concurrency at the source** — a pessimistic, single-writer lock.

## 2. Goals / non-goals

**Goals**
- Only one session may edit a canvas at a time; everyone else is read-only.
- **Server-enforced:** the save action rejects writes from non-holders (corruption can't recur
  even from a stale/buggy client).
- **Per tab/session key:** a random session id holds the lock, so even the same person's second
  tab is read-only (the exact two-tab case that corrupted state).
- **Take-over-when-stale:** a lock whose heartbeat lapses (~45s) can be claimed by a waiting
  viewer via an explicit "Take over" action.
- Retire D32's merge machinery (kills the oscillation loop); keep D31 as a safety net.

**Non-goals**
- Live collaborative editing / real-time viewer sync (Supabase Realtime = future; §7 alt B).
- CRDT same-field merge (Level 3).
- Hard auth on the lock — identity is soft/spoofable (D29); the lock is advisory-but-enforced,
  keyed by an unguessable session id, adequate for an internal MVP tool.

## 3. Data model — migration `0010`

(`0009_approval_flag.sql` is taken by D29; this is the next free number.)

Add three nullable columns to `canvases`:

| column | type | meaning |
|---|---|---|
| `editing_session_id` | `uuid null` | the tab/session token currently holding the lock |
| `editing_name` | `text null` | holder's `identity.name`, for the banner |
| `editing_heartbeat_at` | `timestamptz null` | last heartbeat; staleness derived from this |

The lock is **held** iff `editing_session_id IS NOT NULL AND editing_heartbeat_at > now() -
STALE_TTL`. Nothing is stored as "stale" — staleness is always derived (echoes D9).

**Constants** (`src/lib/canvas/lock-state.ts`): `HEARTBEAT_MS = 15_000`, `STALE_MS = 45_000`
(≈3 missed heartbeats). Chosen so a brief network blip doesn't drop the lock, while an abandoned
tab frees it within a minute.

## 4. Lock lifecycle — server actions (`src/lib/actions/canvas-lock.ts` over `src/lib/db/canvas-lock.ts`)

Each is one atomic SQL statement (race-safe; no read-then-write window).

- **`acquireCanvasLock(canvasId, sessionId, name)` → `{ ok: true } | { ok: false; heldBy: { name: string } }`**
  ```sql
  UPDATE canvases
     SET editing_session_id = $sessionId, editing_name = $name, editing_heartbeat_at = now()
   WHERE id = $canvasId
     AND (editing_session_id IS NULL
          OR editing_session_id = $sessionId
          OR editing_heartbeat_at < now() - interval '45 seconds');
  ```
  1 row updated → acquired (this same statement is the atomic **stale take-over**). 0 rows →
  read the row and return `{ ok: false, heldBy: { name: editing_name } }`.

- **`heartbeatCanvasLock(canvasId, sessionId)` → `{ ok: boolean }`**
  `UPDATE … SET editing_heartbeat_at = now() WHERE id = $canvasId AND editing_session_id =
  $sessionId`. 0 rows → the lock was taken → caller must go read-only.

- **`releaseCanvasLock(canvasId, sessionId)` → `void`**
  `UPDATE … SET editing_session_id = NULL, editing_name = NULL, editing_heartbeat_at = NULL
  WHERE id = $canvasId AND editing_session_id = $sessionId`. Fired on tab close via
  `navigator.sendBeacon` → `POST /api/canvases/[cid]/lock/release`. **Best-effort only** — the
  45s TTL is the real backstop, so a missed release just delays reclaim.

- **`getCanvasLock(canvasId)` → `{ heldBy: { name: string } | null; heartbeatAt: string | null }`**
  For the viewer's poll; the client computes staleness with `isLockStale`.

## 5. Server-enforced writes + retiring D32 (`src/lib/actions/nodes.ts`)

`saveCanvasAction` is rewritten:

```ts
saveCanvasAction(canvasId, {
  nodes, edges, removedNodeIds, removedEdgeIds, sessionId,
}): Promise<{ ok: true } | { ok: false; lockLost: true }>
```

1. Verify the caller holds the lock: `editing_session_id === sessionId` (single guarded read;
   a held lock by definition isn't stale to its own holder). Not the holder → return
   `{ ok: false, lockLost: true }` and **write nothing**.
2. Holder → `saveCanvasNodes` / `saveCanvasEdges` (D31 non-destructive, unchanged) and bump the
   heartbeat as a side effect. Return `{ ok: true }`.

**Removed:** the D32 conflict branch, the `fresh` refetch, `updated_at` as a **token**
(`expectedUpdatedAt`), and the store's `replaceCanvas`. `canvases.updated_at` and the 0008
triggers stay (they power "last edited"). **Kept:** `planReconcile` + tombstones (D31) — with a
single writer they're belt-and-suspenders, and deletes now stick because no second writer
resurrects them.

## 6. Client

### 6.1 Pure lock state (`src/lib/canvas/lock-state.ts`)
- `isLockStale(heartbeatAt: string | null, now: number, ttl = STALE_MS): boolean`
- `lockReducer(state, event)` — a tiny state machine, `role: 'acquiring' | 'editor' | 'viewer'`:
  - `acquired` → `editor`; `denied(heldBy)` → `viewer` (records `heldByName`);
    `heartbeatLost` → `viewer`; `tookOver` → `editor`; `lockFreed` (poll saw stale/null) →
    sets `canTakeOver = true`.
- `canEdit = role === 'editor'`.

### 6.2 `useCanvasLock(canvasId)` hook (`src/hooks/use-canvas-lock.ts`)
- Mints `sessionId` once (`useRef(crypto.randomUUID())`); reads `identity.name` via `useIdentity`.
- On mount → `acquireCanvasLock`; dispatch `acquired`/`denied`.
- **Editor:** `setInterval` heartbeat every `HEARTBEAT_MS`; on `{ ok: false }` → `heartbeatLost`.
  `beforeunload` / unmount → `sendBeacon` release.
- **Viewer:** poll `getCanvasLock` every 10s; when `isLockStale` (or `heldBy === null`) → mark
  `canTakeOver`. `takeOver()` calls `acquireCanvasLock`; on success reload the route (fresh state).
- Returns `{ canEdit, heldByName, canTakeOver, takeOver }`.

### 6.3 Read-only enforcement (strict — one gate blocks everything)
`canEdit` is the **single mutation gate**. It flows to `Canvas` and to every node/focus-view
surface via a small `CanvasEditableContext` (`useCanvasEditable()`). When `false`, ALL mutation
is blocked — no exemptions:
- React Flow: `nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable` stays
  true (viewing), delete keys disabled, quick-add / paste disabled.
- Node + focus-view components read `useCanvasEditable()` to disable **all** write affordances:
  inline-edit fields render as plain read-only text; **generate buttons disabled**; the D29
  **approval / eval controls disabled** (render as read-only readouts). To sign off or generate,
  a senior must hold the lock (take it over).
- `CanvasAutosave` only flushes when `canEdit`; a save returning `lockLost` dispatches
  `heartbeatLost` (defensive — should already be a viewer).
- **Banner** (top of canvas, `shadow-card`, reusing the design system): *"{heldByName} is editing
  — you're viewing read-only."* with a **"Take over editing"** button, disabled until
  `canTakeOver`.

### 6.4 Composition with D29 (identity + approval)
- **Identity is guaranteed.** `<IdentityGate>` already wraps `<Canvas>` in the canvas page, so an
  `identity.name` always exists before the lock tries to acquire — no null-name path.
- **Approval & generation are gated by the same `canEdit`** (strict read-only, per the design
  decision). They write outside `saveCanvasAction` (approval → `node_versions.approval_status`;
  generation → append-only `node_versions` rows), so the **server-side** hard guard stays on
  `saveCanvasAction` (the corruption path). Blocking approval/generation for viewers is done
  **client-side** via `canEdit`. This is safe because those paths are annotation / append-only
  (a stray write can't corrupt canvas structure the way the autosave delete did). *Deferred
  hardening:* add the lock check to the generate routes + `setVersionApprovalAction` for
  defense-in-depth — not required for MVP correctness, noted so it isn't forgotten.
- **No file collision beyond page.tsx**, which both features edit in non-overlapping spots (D29:
  gate/chip in the top bar; this: lock wiring around `<Canvas>` + dropping `initialUpdatedAt`).

## 7. Alternatives considered / rejected

- **A — Supabase Realtime Presence.** Auto-release on disconnect, no TTL guessing, live viewer
  updates. Rejected for now: new Realtime dependency + still needs the §5 server write-guard
  (presence is soft). The natural upgrade when live multi-viewer is wanted.
- **B — Postgres advisory locks (`pg_advisory_lock`).** True locks, but tied to a DB
  connection/session — incompatible with stateless Next.js server actions. Rejected.
- **C — Keep D32, just guard the loop** (suppress `replaceCanvas`-triggered saves). Stops the
  oscillation but leaves mine-wins clobber + delete-resurrection. Rejected — treats a symptom.
- **Client-only enforcement.** Simpler, but a stale tab could still write and re-corrupt.
  Rejected in favor of server enforcement.
- **Per-person (identity) lock key.** Wouldn't stop the same person's two tabs (both "Cyril") —
  the case that corrupted state. Rejected for per-session.

## 8. Testing (TDD)

- **Pure (`lock-state.test.ts`):** `isLockStale` boundaries (just-under / just-over `STALE_MS`,
  null heartbeat); `lockReducer` transitions for every event, asserting `canEdit` /
  `canTakeOver`.
- **Save guard:** the pure holder check + that a non-holder payload yields `{ lockLost: true }`
  and triggers no DB write (DB-touching parts scoped to manual/integration).
- **Manual two-tab check:** tab A edits and persists; tab B is read-only with the banner and has
  **drag/connect/delete, generate, and approval all disabled** (strict read-only); after ~45s of
  A idle/closed, B's "Take over" enables, claims the lock, and reloads as editor; A's next save
  returns `lockLost` and A flips to read-only.

## 9. ADR entry to append (staging-roadmap §7)

**D33 — Pessimistic single-writer canvas lock; retires D32's optimistic merge** *(recorded
2026-07-01; supersedes D32; builds on D31, D29, D9, D13)*. A canvas is edited by one session at
a time. Lock lives in `canvases` columns (`editing_session_id` / `editing_name` /
`editing_heartbeat_at`), keyed by an unguessable **per-tab session id**; held iff heartbeat is
within `STALE_MS` (45s), refreshed every 15s. **Server-enforced** — `saveCanvasAction` rejects
writes from non-holders. Second openers are **strict read-only** (a single `canEdit` gate blocks
canvas edits, generation, AND D29 approval) with a "{name} is editing" banner and an explicit
**take-over-when-stale** button. Depends on the D29 identity system (`<IdentityGate>` guarantees a
holder name; migration is `0010` since D29 took `0009`). Retires D32's
conflict/merge/`replaceCanvas` loop (the oscillation source); keeps D31 non-destructive deletes
(now they stick — no second writer).
**Rejected:** Realtime Presence (new dep; still needs server guard — future), pg_advisory_lock
(connection-bound; incompatible with serverless actions), client-only enforcement (stale tab can
still write), per-person key (doesn't stop same-person two tabs), keep-D32-guard-the-loop (treats
a symptom). **Deferred:** live viewer sync + CRDT. **Originated:**
`2026-07-01-canvas-pessimistic-lock-design.md`.
