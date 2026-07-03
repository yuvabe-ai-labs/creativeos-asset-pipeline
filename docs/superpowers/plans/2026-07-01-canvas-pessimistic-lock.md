# Canvas Pessimistic Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One session edits a canvas at a time — server-enforced pessimistic lock with heartbeat/TTL and take-over-when-stale; everyone else is strict read-only. Retires D32's optimistic-merge autosave (the oscillation loop).

**Architecture:** A per-tab session id holds a lock stored in `canvases` columns; an atomic Postgres RPC does acquire/take-over; the client heartbeats while editing and releases on unload. `saveCanvasAction` rejects writes from non-holders. A pure `lock-state` module (constants + `isLockStale` + `lockReducer`) is unit-tested; `useCanvasLock` drives the UI; `canEdit` flows via `CanvasEditableContext` to block every mutation surface.

**Tech Stack:** Next.js (App Router, server actions + one route handler), TypeScript, Supabase (Postgres + RPC), React (`useReducer`), React Flow, Zustand, Vitest.

**Spec:** [docs/superpowers/specs/2026-07-01-canvas-pessimistic-lock-design.md](../specs/2026-07-01-canvas-pessimistic-lock-design.md)

## Global Constraints

- **Migration is `0010`** — `0009_approval_flag.sql` (D29) is taken.
- **Depends on D29 identity** (already on this branch): `useIdentity`, `<IdentityGate>` (guarantees `identity.name` before `<Canvas>` renders), `use-identity.ts`.
- **Lock key = per tab/session** (a random `crypto.randomUUID()` per canvas-open), NOT identity — so even the same person's second tab is read-only.
- **Server-enforced:** `saveCanvasAction` verifies the caller holds the lock; non-holder → `{ ok: false, lockLost: true }`, writes nothing.
- **Constants:** `HEARTBEAT_MS = 15_000`, `STALE_MS = 45_000`.
- **Strict read-only:** a single `canEdit` gate blocks canvas edits, generation, AND approval. No exemptions.
- **Retire D32:** remove the conflict/merge branch, `expectedUpdatedAt` token, `replaceCanvas`, and merge logic from `runAutosaveFlush`. KEEP D31 (`planReconcile` + tombstones) and `canvases.updated_at` + the 0008 triggers (they power "last edited").
- **API routes:** use `apiOk` / `apiError` from `src/lib/api/route-helpers.ts` — never `NextResponse.json` directly.
- **shadcn/Base UI only** for controls; Lucide icons at 1.5 stroke; Motion easing `cubic-bezier(0.22,1,0.36,1)`; never hardcode colors outside the design-system tokens.

---

## File Structure

- `supabase/migrations/0010_canvas_editing_lock.sql` — 3 columns + `acquire_canvas_lock` RPC. *(new)*
- `src/lib/db/types.ts` — extend `CanvasRow`. *(modify)*
- `src/lib/canvas/lock-state.ts` + `.test.ts` — pure constants, `isLockStale`, `lockReducer`, `canEdit`. *(new)*
- `src/lib/db/canvas-lock.ts` — DB layer (acquire via RPC, heartbeat, release, getCanvasLock, getCanvasLockHolder). *(new)*
- `src/lib/actions/canvas-lock.ts` — server actions. *(new)*
- `src/app/api/canvases/[cid]/lock/release/route.ts` — sendBeacon release. *(new)*
- `src/lib/actions/nodes.ts` — rewrite `saveCanvasAction` (server-enforced, no D32). *(modify)*
- `src/components/canvas/autosave-flush.ts` + `.test.ts` — simplify (no merge). *(modify)*
- `src/lib/canvas-store.ts` + `src/lib/canvas-store.test.ts` — drop `replaceCanvas`. *(modify)*
- `src/hooks/use-canvas-lock.ts` — the client hook. *(new)*
- `src/components/canvas/canvas-editable-context.tsx` — `canEdit` context + `useCanvasEditable`. *(new)*
- `src/components/canvas/lock-banner.tsx` — read-only banner + take-over. *(new)*
- `src/components/canvas/canvas.tsx` — call `useCanvasLock`, gate RF interactions, provide context, render banner. *(modify)*
- `src/components/canvas/canvas-autosave.tsx` — gate on `canEdit`, pass `sessionId`, handle `lockLost`. *(modify)*
- `src/app/clients/[id]/canvases/[cid]/page.tsx` — drop `initialUpdatedAt`. *(modify)*
- `src/components/nodes/editable-field.tsx` — force `readOnly` when `!canEdit`. *(modify)*
- Focus views + node components — gate generate/approval on `canEdit`. *(modify, enumerated in Task 8)*

---

### Task 1: Migration `0010` — lock columns + atomic acquire RPC + `CanvasRow`

**Files:**
- Create: `supabase/migrations/0010_canvas_editing_lock.sql`
- Modify: `src/lib/db/types.ts:47-55` (`CanvasRow`)

**Interfaces:**
- Produces (DB): `canvases.editing_session_id uuid`, `.editing_name text`, `.editing_heartbeat_at timestamptz`; RPC `acquire_canvas_lock(p_canvas_id uuid, p_session_id uuid, p_name text, p_stale_seconds int) → boolean`.
- Produces (TS): `CanvasRow` gains `editing_session_id: string | null`, `editing_name: string | null`, `editing_heartbeat_at: string | null`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0010_canvas_editing_lock.sql`:

```sql
-- D33: pessimistic single-writer canvas lock. One SESSION (a per-tab uuid, not a
-- person) edits a canvas at a time; the holder heartbeats and a lapsed lock is
-- stealable. See docs/superpowers/specs/2026-07-01-canvas-pessimistic-lock-design.md.

alter table canvases
  add column editing_session_id  uuid,
  add column editing_name        text,      -- holder's soft-identity name, for the banner
  add column editing_heartbeat_at timestamptz;

-- Atomic acquire / stale take-over in ONE statement (no read-then-write race).
-- Claims the lock iff it is free, already ours, or stale. Returns true when acquired.
create or replace function acquire_canvas_lock(
  p_canvas_id uuid,
  p_session_id uuid,
  p_name text,
  p_stale_seconds int
) returns boolean
language plpgsql
as $$
begin
  update canvases
     set editing_session_id  = p_session_id,
         editing_name        = p_name,
         editing_heartbeat_at = now()
   where id = p_canvas_id
     and (editing_session_id is null
          or editing_session_id = p_session_id
          or editing_heartbeat_at < now() - make_interval(secs => p_stale_seconds));
  return found; -- FOUND is true iff the UPDATE affected a row
end;
$$;
```

- [ ] **Step 2: Extend `CanvasRow`**

In `src/lib/db/types.ts`, replace the `CanvasRow` type (lines 47-55) with:

```ts
export type CanvasRow = {
  id: string;
  client_id: string;
  slug: string;
  name: string;
  viewport: { x: number; y: number; zoom: number };
  created_at: string;
  updated_at: string;
  // D33 pessimistic lock — null when no one holds it.
  editing_session_id: string | null;
  editing_name: string | null;
  editing_heartbeat_at: string | null;
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_canvas_editing_lock.sql src/lib/db/types.ts
git commit -m "feat(db): canvas editing-lock columns + acquire RPC (D33)"
```

> Apply the migration to your Supabase instance before the manual checks in Tasks 7-8 (`supabase db push`, or paste the SQL in the Supabase SQL editor).

---

### Task 2: Pure lock-state module (constants, `isLockStale`, `lockReducer`)

**Files:**
- Create: `src/lib/canvas/lock-state.ts`
- Test: `src/lib/canvas/lock-state.test.ts`

**Interfaces:**
- Produces: `HEARTBEAT_MS`, `STALE_MS`; `isLockStale(heartbeatAt: string | null, now: number, ttl?: number): boolean`; `type LockState = { role: 'acquiring'|'editor'|'viewer'; heldByName: string | null; canTakeOver: boolean }`; `INITIAL_LOCK_STATE`; `type LockEvent`; `lockReducer(state, event): LockState`; `canEdit(state): boolean`.

- [ ] **Step 1: Write the failing test**

`src/lib/canvas/lock-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isLockStale, lockReducer, canEdit, INITIAL_LOCK_STATE, STALE_MS,
} from "./lock-state";

const NOW = 1_000_000;

describe("isLockStale", () => {
  it("is stale when heartbeat is null", () => {
    expect(isLockStale(null, NOW)).toBe(true);
  });
  it("is stale when heartbeat is older than STALE_MS", () => {
    const old = new Date(NOW - STALE_MS - 1).toISOString();
    expect(isLockStale(old, NOW)).toBe(true);
  });
  it("is fresh when heartbeat is within STALE_MS", () => {
    const recent = new Date(NOW - 1000).toISOString();
    expect(isLockStale(recent, NOW)).toBe(false);
  });
  it("is stale for an unparseable timestamp", () => {
    expect(isLockStale("not-a-date", NOW)).toBe(true);
  });
});

describe("lockReducer", () => {
  it("acquired → editor (canEdit true)", () => {
    const s = lockReducer(INITIAL_LOCK_STATE, { type: "acquired" });
    expect(s.role).toBe("editor");
    expect(canEdit(s)).toBe(true);
  });
  it("denied → viewer, records holder name, cannot edit or take over", () => {
    const s = lockReducer(INITIAL_LOCK_STATE, { type: "denied", heldByName: "Cyril" });
    expect(s.role).toBe("viewer");
    expect(s.heldByName).toBe("Cyril");
    expect(canEdit(s)).toBe(false);
    expect(s.canTakeOver).toBe(false);
  });
  it("heartbeatLost → viewer (was editor)", () => {
    const editor = lockReducer(INITIAL_LOCK_STATE, { type: "acquired" });
    const s = lockReducer(editor, { type: "heartbeatLost" });
    expect(s.role).toBe("viewer");
    expect(canEdit(s)).toBe(false);
  });
  it("lockFreed while viewer → canTakeOver true", () => {
    const viewer = lockReducer(INITIAL_LOCK_STATE, { type: "denied", heldByName: "X" });
    const s = lockReducer(viewer, { type: "lockFreed" });
    expect(s.canTakeOver).toBe(true);
    expect(s.role).toBe("viewer");
  });
  it("lockFreed while editor is a no-op", () => {
    const editor = lockReducer(INITIAL_LOCK_STATE, { type: "acquired" });
    expect(lockReducer(editor, { type: "lockFreed" })).toEqual(editor);
  });
  it("tookOver → editor", () => {
    const viewer = lockReducer(INITIAL_LOCK_STATE, { type: "denied", heldByName: "X" });
    const s = lockReducer(viewer, { type: "tookOver" });
    expect(s.role).toBe("editor");
    expect(canEdit(s)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas/lock-state.test.ts`
Expected: FAIL — cannot resolve `./lock-state`.

- [ ] **Step 3: Write the module**

`src/lib/canvas/lock-state.ts`:

```ts
// D33 pure lock state — no React, no DB, so it is fully unit-testable.
export const HEARTBEAT_MS = 15_000;
export const STALE_MS = 45_000;

// A lock is stale when its last heartbeat is older than ttl (or missing/unparseable).
export function isLockStale(
  heartbeatAt: string | null,
  now: number,
  ttl: number = STALE_MS,
): boolean {
  if (!heartbeatAt) return true;
  const t = Date.parse(heartbeatAt);
  if (Number.isNaN(t)) return true;
  return now - t > ttl;
}

export type LockRole = "acquiring" | "editor" | "viewer";
export type LockState = {
  role: LockRole;
  heldByName: string | null;
  canTakeOver: boolean;
};

export const INITIAL_LOCK_STATE: LockState = {
  role: "acquiring",
  heldByName: null,
  canTakeOver: false,
};

export type LockEvent =
  | { type: "acquired" }
  | { type: "denied"; heldByName: string | null }
  | { type: "heartbeatLost" }
  | { type: "tookOver" }
  | { type: "lockFreed" };

export function lockReducer(state: LockState, event: LockEvent): LockState {
  switch (event.type) {
    case "acquired":
    case "tookOver":
      return { role: "editor", heldByName: null, canTakeOver: false };
    case "denied":
      return { role: "viewer", heldByName: event.heldByName, canTakeOver: false };
    case "heartbeatLost":
      return { role: "viewer", heldByName: state.heldByName, canTakeOver: false };
    case "lockFreed":
      // Only a waiting viewer can gain the ability to take over.
      return state.role === "viewer" ? { ...state, canTakeOver: true } : state;
    default:
      return state;
  }
}

export function canEdit(state: LockState): boolean {
  return state.role === "editor";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas/lock-state.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/lock-state.ts src/lib/canvas/lock-state.test.ts
git commit -m "feat(canvas): pure lock-state (isLockStale + lockReducer) (D33)"
```

---

### Task 3: DB layer — `canvas-lock.ts`

**Files:**
- Create: `src/lib/db/canvas-lock.ts`

**Interfaces:**
- Consumes: `createServerSupabase`; the RPC + columns from Task 1; `STALE_MS` from Task 2 (converted to seconds).
- Produces:
  - `acquireCanvasLock(canvasId, sessionId, name): Promise<{ ok: true } | { ok: false; heldBy: { name: string | null } }>`
  - `heartbeatCanvasLock(canvasId, sessionId): Promise<{ ok: boolean }>`
  - `releaseCanvasLock(canvasId, sessionId): Promise<void>`
  - `getCanvasLock(canvasId): Promise<{ heldBy: { name: string | null } | null; heartbeatAt: string | null }>`
  - `getCanvasLockHolder(canvasId): Promise<string | null>` (the raw `editing_session_id`, for the save guard)

- [ ] **Step 1: Write the module**

`src/lib/db/canvas-lock.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { STALE_MS } from "@/lib/canvas/lock-state";

const STALE_SECONDS = Math.round(STALE_MS / 1000);

// Atomic acquire / stale take-over via the RPC (Task 1). Returns ok, or the current holder.
export async function acquireCanvasLock(
  canvasId: string,
  sessionId: string,
  name: string | null,
): Promise<{ ok: true } | { ok: false; heldBy: { name: string | null } }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("acquire_canvas_lock", {
    p_canvas_id: canvasId,
    p_session_id: sessionId,
    p_name: name,
    p_stale_seconds: STALE_SECONDS,
  });
  if (error) throw error;
  if (data === true) return { ok: true };

  const { data: row, error: readErr } = await supabase
    .from("canvases")
    .select("editing_name")
    .eq("id", canvasId)
    .maybeSingle();
  if (readErr) throw readErr;
  return { ok: false, heldBy: { name: (row as { editing_name: string | null } | null)?.editing_name ?? null } };
}

// Refresh the heartbeat — only if I still hold it. 0 rows updated → I lost the lock.
export async function heartbeatCanvasLock(
  canvasId: string,
  sessionId: string,
): Promise<{ ok: boolean }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .update({ editing_heartbeat_at: new Date().toISOString() })
    .eq("id", canvasId)
    .eq("editing_session_id", sessionId)
    .select("id");
  if (error) throw error;
  return { ok: (data?.length ?? 0) > 0 };
}

// Release the lock if I hold it (best-effort; TTL is the backstop).
export async function releaseCanvasLock(
  canvasId: string,
  sessionId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("canvases")
    .update({ editing_session_id: null, editing_name: null, editing_heartbeat_at: null })
    .eq("id", canvasId)
    .eq("editing_session_id", sessionId);
  if (error) throw error;
}

// Read the lock for a viewer's poll. heldBy is null when unheld (staleness computed client-side).
export async function getCanvasLock(
  canvasId: string,
): Promise<{ heldBy: { name: string | null } | null; heartbeatAt: string | null }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("editing_session_id, editing_name, editing_heartbeat_at")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  const row = data as {
    editing_session_id: string | null;
    editing_name: string | null;
    editing_heartbeat_at: string | null;
  } | null;
  if (!row || !row.editing_session_id) return { heldBy: null, heartbeatAt: null };
  return { heldBy: { name: row.editing_name }, heartbeatAt: row.editing_heartbeat_at };
}

// The raw holder session id — for the server-side save guard.
export async function getCanvasLockHolder(canvasId: string): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("editing_session_id")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  return (data as { editing_session_id: string | null } | null)?.editing_session_id ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

> No unit test here — these are thin Supabase/RPC wrappers (the repo doesn't mock Supabase writes). Correctness is covered by the pure `lock-state` tests (Task 2), the `runAutosaveFlush` test (Task 5), and the manual two-tab check (Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/canvas-lock.ts
git commit -m "feat(db): canvas lock repo — acquire/heartbeat/release/get (D33)"
```

---

### Task 4: Server actions + release route

**Files:**
- Create: `src/lib/actions/canvas-lock.ts`
- Create: `src/app/api/canvases/[cid]/lock/release/route.ts`

**Interfaces:**
- Consumes: Task 3 functions; `apiOk`/`apiError` from `@/lib/api/route-helpers`.
- Produces: `acquireCanvasLockAction`, `heartbeatCanvasLockAction`, `releaseCanvasLockAction`, `getCanvasLockAction` (same signatures/returns as their DB counterparts); `POST /api/canvases/[cid]/lock/release`.

- [ ] **Step 1: Write the server actions**

`src/lib/actions/canvas-lock.ts`:

```ts
"use server";

import {
  acquireCanvasLock,
  heartbeatCanvasLock,
  releaseCanvasLock,
  getCanvasLock,
} from "@/lib/db/canvas-lock";

export async function acquireCanvasLockAction(
  canvasId: string,
  sessionId: string,
  name: string | null,
) {
  return acquireCanvasLock(canvasId, sessionId, name);
}

export async function heartbeatCanvasLockAction(canvasId: string, sessionId: string) {
  return heartbeatCanvasLock(canvasId, sessionId);
}

export async function releaseCanvasLockAction(canvasId: string, sessionId: string) {
  await releaseCanvasLock(canvasId, sessionId);
}

export async function getCanvasLockAction(canvasId: string) {
  return getCanvasLock(canvasId);
}
```

- [ ] **Step 2: Write the release route (for `sendBeacon` on unload)**

`src/app/api/canvases/[cid]/lock/release/route.ts`:

```ts
import { apiOk, apiError } from "@/lib/api/route-helpers";
import { releaseCanvasLock } from "@/lib/db/canvas-lock";

// sendBeacon target — best-effort lock release when a tab closes. Server actions
// can't be beaconed, so this is a plain route handler.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!sessionId) return apiError("sessionId is required.", 400);
  await releaseCanvasLock(cid, sessionId);
  return apiOk({ released: true });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/canvas-lock.ts "src/app/api/canvases/[cid]/lock/release/route.ts"
git commit -m "feat(canvas): lock server actions + sendBeacon release route (D33)"
```

---

### Task 5: Server-enforce `saveCanvasAction` + retire D32 (flush + store)

**Files:**
- Modify: `src/lib/actions/nodes.ts:1-51`
- Modify: `src/components/canvas/autosave-flush.ts` + `src/components/canvas/autosave-flush.test.ts`
- Modify: `src/lib/canvas-store.ts` (drop `replaceCanvas`) + `src/lib/canvas-store.test.ts`

**Interfaces:**
- Produces: `saveCanvasAction(canvasId, { nodes, edges, removedNodeIds, removedEdgeIds, sessionId }): Promise<{ ok: true } | { ok: false; lockLost: true }>`
- Produces: `runAutosaveFlush({ canvasId, snapshot, sessionId, save, onLockLost }): Promise<void>` where `snapshot: AutosaveSnapshot` (unchanged shape) and `save: typeof saveCanvasAction`.
- Removes: store `replaceCanvas`.

- [ ] **Step 1: Rewrite `saveCanvasAction` (server-enforced, no D32)**

In `src/lib/actions/nodes.ts`, replace the import block and the whole `saveCanvasAction` function (lines 1-51) with:

```ts
"use server";

import { saveCanvasNodes, type PersistedNode } from "@/lib/db/nodes";
import { saveCanvasEdges } from "@/lib/db/edges";
import { getCanvasLockHolder } from "@/lib/db/canvas-lock";
import { updateActiveVersionOutput } from "@/lib/db/versions";
import type { Edge } from "@xyflow/react";

export async function saveCanvasNodesAction(
  canvasId: string,
  nodes: PersistedNode[],
) {
  await saveCanvasNodes(canvasId, nodes);
}

// D33: server-enforced autosave. Writes only if the caller holds the lock; otherwise
// returns lockLost and writes nothing. (Replaces D32's optimistic merge — single writer,
// so no conflict to reconcile.) D31 non-destructive deletes are unchanged.
export async function saveCanvasAction(
  canvasId: string,
  payload: {
    nodes: PersistedNode[];
    edges: Edge[];
    removedNodeIds: string[];
    removedEdgeIds: string[];
    sessionId: string;
  },
): Promise<{ ok: true } | { ok: false; lockLost: true }> {
  const holder = await getCanvasLockHolder(canvasId);
  if (holder !== payload.sessionId) return { ok: false, lockLost: true };

  await saveCanvasNodes(canvasId, payload.nodes, payload.removedNodeIds);
  await saveCanvasEdges(canvasId, payload.edges, payload.removedEdgeIds);
  return { ok: true };
}
```

(The `saveScriptOutputAction` / `savePromptOutputAction` functions below stay unchanged. The old imports `listNodes`, `listEdges`, `getCanvasUpdatedAt`, `nodeRowToFlow`, `AppNode` are now gone — confirm none remain.)

- [ ] **Step 2: Typecheck to see what still references the removed shape**

Run: `npx tsc --noEmit`
Expected: errors in `autosave-flush.ts` / `autosave-flush.test.ts` (old `save` shape) and possibly `canvas-autosave.tsx` (fixed in Task 7). Proceed to fix the flush next.

- [ ] **Step 3: Rewrite the flush test for the new shape**

Replace `src/components/canvas/autosave-flush.test.ts` with:

```ts
import { describe, it, expect, vi } from "vitest";
import { runAutosaveFlush } from "./autosave-flush";
import type { saveCanvasAction } from "@/lib/actions/nodes";

const snapshot = { nodes: [], edges: [], removedNodeIds: ["n9"], removedEdgeIds: [] };

function deps(save: unknown, onLockLost = vi.fn()) {
  return {
    canvasId: "c1",
    snapshot,
    sessionId: "s1",
    save: save as typeof saveCanvasAction,
    onLockLost,
  };
}

describe("runAutosaveFlush", () => {
  it("sends the snapshot with the sessionId and does nothing extra on ok", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const onLockLost = vi.fn();
    await runAutosaveFlush(deps(save, onLockLost));
    expect(save).toHaveBeenCalledWith("c1", { ...snapshot, sessionId: "s1" });
    expect(onLockLost).not.toHaveBeenCalled();
  });

  it("calls onLockLost when the save is rejected", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, lockLost: true });
    const onLockLost = vi.fn();
    await runAutosaveFlush(deps(save, onLockLost));
    expect(onLockLost).toHaveBeenCalledTimes(1);
  });

  it("swallows save errors (best-effort) and does not call onLockLost", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const onLockLost = vi.fn();
    await expect(runAutosaveFlush(deps(save, onLockLost))).resolves.toBeUndefined();
    expect(onLockLost).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/components/canvas/autosave-flush.test.ts`
Expected: FAIL (old implementation has different params / calls `onSaved`).

- [ ] **Step 5: Rewrite `runAutosaveFlush`**

Replace `src/components/canvas/autosave-flush.ts` with:

```ts
import type { PersistedNode } from "@/lib/db/nodes";
import type { Edge } from "@xyflow/react";
import type { saveCanvasAction } from "@/lib/actions/nodes";

export type AutosaveSnapshot = {
  nodes: PersistedNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
};

// D33: server-enforced flush. Sends the snapshot + sessionId; if the server rejects
// (lock lost), notifies via onLockLost so the client flips to read-only. Best-effort:
// errors are swallowed.
export async function runAutosaveFlush(deps: {
  canvasId: string;
  snapshot: AutosaveSnapshot;
  sessionId: string;
  save: typeof saveCanvasAction;
  onLockLost: () => void;
}): Promise<void> {
  const { canvasId, snapshot, sessionId, save, onLockLost } = deps;
  try {
    const result = await save(canvasId, { ...snapshot, sessionId });
    if (!result.ok) onLockLost();
  } catch {
    // best-effort autosave — swallow
  }
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run src/components/canvas/autosave-flush.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Drop `replaceCanvas` from the store**

In `src/lib/canvas-store.ts`:
1. Remove the `replaceCanvas: (nodes: AppNode[], edges: Edge[]) => void;` line from the `CanvasState` type.
2. Remove the whole `replaceCanvas: (nodes, edges) => { … }` implementation block (the one with the "Adopt a server-merged canvas (Level 1 conflict path)" comment).

Keep `removedNodeIds`, `removedEdgeIds`, and `clearRemoved` — the autosave still uses them (D31).

- [ ] **Step 8: Remove the `replaceCanvas` tests**

In `src/lib/canvas-store.test.ts`, delete the two tests that call `replaceCanvas` ("replaceCanvas swaps nodes/edges…" and "replaceCanvas preserves selection by id"). Leave the tombstone / `clearRemoved` tests intact.

- [ ] **Step 9: Run the store test + typecheck**

Run: `npx vitest run src/lib/canvas-store.test.ts && npx tsc --noEmit`
Expected: store tests PASS; the only remaining type error is in `canvas-autosave.tsx` (rewired in Task 7).

- [ ] **Step 10: Commit**

```bash
git add src/lib/actions/nodes.ts src/components/canvas/autosave-flush.ts src/components/canvas/autosave-flush.test.ts src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(canvas): server-enforced saveCanvasAction; retire D32 merge (D33)"
```

---

### Task 6: `useCanvasLock` hook

**Files:**
- Create: `src/hooks/use-canvas-lock.ts`

**Interfaces:**
- Consumes: `useIdentity` (D29); Task 2 (`lockReducer`, `INITIAL_LOCK_STATE`, `isLockStale`, `canEdit`, `HEARTBEAT_MS`); Task 4 actions.
- Produces: `useCanvasLock(canvasId: string): { canEdit: boolean; heldByName: string | null; canTakeOver: boolean; sessionId: string; takeOver: () => Promise<void>; reportLockLost: () => void }`.

- [ ] **Step 1: Write the hook**

`src/hooks/use-canvas-lock.ts`:

```ts
"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useIdentity } from "./use-identity";
import {
  lockReducer,
  INITIAL_LOCK_STATE,
  isLockStale,
  canEdit as isEditorState,
  HEARTBEAT_MS,
} from "@/lib/canvas/lock-state";
import {
  acquireCanvasLockAction,
  heartbeatCanvasLockAction,
  getCanvasLockAction,
} from "@/lib/actions/canvas-lock";

const POLL_MS = 10_000;

// D33: acquires a per-tab lock on the canvas, heartbeats while editing, releases on
// unload, and polls for take-over while read-only.
export function useCanvasLock(canvasId: string) {
  const { identity } = useIdentity();
  const [state, dispatch] = useReducer(lockReducer, INITIAL_LOCK_STATE);

  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = crypto.randomUUID();
  const sessionId = sessionIdRef.current;

  const nameRef = useRef<string | null>(identity?.name ?? null);
  nameRef.current = identity?.name ?? null;

  // Acquire on mount.
  useEffect(() => {
    let cancelled = false;
    void acquireCanvasLockAction(canvasId, sessionId, nameRef.current).then((r) => {
      if (cancelled) return;
      dispatch(r.ok ? { type: "acquired" } : { type: "denied", heldByName: r.heldBy.name });
    });
    return () => {
      cancelled = true;
    };
  }, [canvasId, sessionId]);

  const isEditor = isEditorState(state);

  // Heartbeat + release while editing.
  useEffect(() => {
    if (!isEditor) return;
    const id = setInterval(() => {
      void heartbeatCanvasLockAction(canvasId, sessionId).then((r) => {
        if (!r.ok) dispatch({ type: "heartbeatLost" });
      });
    }, HEARTBEAT_MS);

    const release = () => {
      navigator.sendBeacon?.(
        `/api/canvases/${canvasId}/lock/release`,
        new Blob([JSON.stringify({ sessionId })], { type: "application/json" }),
      );
    };
    window.addEventListener("beforeunload", release);
    return () => {
      clearInterval(id);
      window.removeEventListener("beforeunload", release);
      release(); // also release on unmount (navigating away in-app)
    };
  }, [isEditor, canvasId, sessionId]);

  // Poll while viewer to detect a free/stale lock (enables take-over).
  const isViewer = state.role === "viewer";
  useEffect(() => {
    if (!isViewer) return;
    const id = setInterval(() => {
      void getCanvasLockAction(canvasId).then((lock) => {
        if (lock.heldBy === null || isLockStale(lock.heartbeatAt, Date.now())) {
          dispatch({ type: "lockFreed" });
        }
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isViewer, canvasId]);

  const takeOver = useCallback(async () => {
    const r = await acquireCanvasLockAction(canvasId, sessionId, nameRef.current);
    if (r.ok) {
      dispatch({ type: "tookOver" });
      window.location.reload(); // reload to pick up the latest committed canvas
    }
  }, [canvasId, sessionId]);

  const reportLockLost = useCallback(() => dispatch({ type: "heartbeatLost" }), []);

  return {
    canEdit: isEditor,
    heldByName: state.heldByName,
    canTakeOver: state.canTakeOver,
    sessionId,
    takeOver,
    reportLockLost,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `use-canvas-lock.ts` (still one pending in `canvas-autosave.tsx` until Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-canvas-lock.ts
git commit -m "feat(canvas): useCanvasLock hook — acquire/heartbeat/poll/takeover (D33)"
```

---

### Task 7: `CanvasEditableContext` + read-only Canvas + banner + autosave wiring + page.tsx

**Files:**
- Create: `src/components/canvas/canvas-editable-context.tsx`
- Create: `src/components/canvas/lock-banner.tsx`
- Modify: `src/components/canvas/canvas.tsx`
- Modify: `src/components/canvas/canvas-autosave.tsx`
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`

**Interfaces:**
- Consumes: `useCanvasLock` (Task 6), `runAutosaveFlush` (Task 5).
- Produces: `<CanvasEditableProvider value={boolean}>`, `useCanvasEditable(): boolean`; `<LockBanner heldByName canTakeOver onTakeOver />`; `Canvas` no longer takes `initialUpdatedAt`; `<CanvasAutosave canvasId sessionId canEdit onLockLost />`.

- [ ] **Step 1: Write the editable context**

`src/components/canvas/canvas-editable-context.tsx`:

```ts
"use client";

import { createContext, useContext, type ReactNode } from "react";

// Whether the current session may mutate the canvas (holds the D33 lock). Defaults to
// true so any surface used outside a canvas (if any) is unaffected.
const CanvasEditableContext = createContext<boolean>(true);

export function CanvasEditableProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return <CanvasEditableContext.Provider value={value}>{children}</CanvasEditableContext.Provider>;
}

export function useCanvasEditable(): boolean {
  return useContext(CanvasEditableContext);
}
```

- [ ] **Step 2: Write the banner**

`src/components/canvas/lock-banner.tsx`:

```tsx
"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown when this session is read-only. "Take over" enables once the holder's lock is stale.
export function LockBanner({
  heldByName,
  canTakeOver,
  onTakeOver,
}: {
  heldByName: string | null;
  canTakeOver: boolean;
  onTakeOver: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/90 px-4 py-2 shadow-card backdrop-blur">
      <Lock className="size-4 text-muted-foreground" strokeWidth={1.5} />
      <span className="text-sm text-muted-foreground">
        {heldByName ? `${heldByName} is editing` : "Another session is editing"} — you're viewing
        read-only.
      </span>
      <Button size="sm" variant="outline" disabled={!canTakeOver} onClick={onTakeOver}>
        Take over editing
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Wire the lock into `Canvas`**

In `src/components/canvas/canvas.tsx`:

1. Add imports near the others:
```ts
import { useCanvasLock } from "@/hooks/use-canvas-lock";
import { CanvasEditableProvider } from "./canvas-editable-context";
import { LockBanner } from "./lock-banner";
```
2. Change the signature (was `{ canvasId, initialUpdatedAt }`) to just `{ canvasId }`:
```tsx
export function Canvas({ canvasId }: { canvasId: string }) {
```
3. At the top of the component body (after the store hooks), add:
```ts
  const { canEdit, heldByName, canTakeOver, sessionId, takeOver, reportLockLost } =
    useCanvasLock(canvasId);
```
4. Gate the interactive handlers on `canEdit`: in the keyboard `useEffect` handler, return early when `!canEdit` for the create/duplicate/paste paths (add `if (!canEdit) return;` at the top of the `handler`, but AFTER the `isEditableTarget` guard so typing in read-only inputs is unaffected — though there won't be editable inputs in read-only). Also guard `openQuickAddAt` and `handlePasteImage` with an early `if (!canEdit) return;`.
5. Change the `CanvasAutosave` render to pass the new props:
```tsx
      <CanvasAutosave
        canvasId={canvasId}
        sessionId={sessionId}
        canEdit={canEdit}
        onLockLost={reportLockLost}
      />
```
6. Wrap the returned JSX tree in the provider, and add the banner + gate React Flow. Change the outermost `return (<div …>` so the root is the provider, and set the RF interaction props from `canEdit`:
```tsx
  return (
    <CanvasEditableProvider value={canEdit}>
      <div className="absolute inset-0 bg-[var(--neutral-50)]">
        {!canEdit && (
          <LockBanner heldByName={heldByName} canTakeOver={canTakeOver} onTakeOver={takeOver} />
        )}
        <CanvasAutosave
          canvasId={canvasId}
          sessionId={sessionId}
          canEdit={canEdit}
          onLockLost={reportLockLost}
        />
        {/* …existing quickAdd + ReactFlow… */}
        <ReactFlow
          /* …existing props… */
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
          /* keep the rest unchanged */
        >
          {/* …unchanged children… */}
        </ReactFlow>
      </div>
    </CanvasEditableProvider>
  );
```
   (Move the single `<CanvasAutosave>` — don't render it twice; the block above shows both the banner region and the RF block. Keep exactly one `<CanvasAutosave>`.)

- [ ] **Step 4: Wire `canEdit` + `sessionId` into `CanvasAutosave`**

Replace `src/components/canvas/canvas-autosave.tsx` with:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasAction } from "@/lib/actions/nodes";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { runAutosaveFlush } from "./autosave-flush";

// Debounced, server-enforced autosave. Only runs while this session holds the lock
// (canEdit). A rejected save (lock lost) calls onLockLost so the UI flips to read-only.
export function CanvasAutosave({
  canvasId,
  sessionId,
  canEdit,
  onLockLost,
}: {
  canvasId: string;
  sessionId: string;
  canEdit: boolean;
  onLockLost: () => void;
}) {
  const storeApi = useCanvasStoreApi();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  useEffect(() => {
    const unsub = storeApi.subscribe((state, prev) => {
      if (state.nodes === prev.nodes && state.edges === prev.edges) return;
      if (!canEditRef.current) return; // read-only: never persist
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const s = storeApi.getState();
        void runAutosaveFlush({
          canvasId,
          snapshot: {
            nodes: s.nodes.map(flowToPersisted),
            edges: s.edges,
            removedNodeIds: s.removedNodeIds,
            removedEdgeIds: s.removedEdgeIds,
          },
          sessionId,
          save: saveCanvasAction,
          onLockLost,
        }).then(() => {
          if (canEditRef.current) storeApi.getState().clearRemoved(s.removedNodeIds, s.removedEdgeIds);
        });
      }, 600);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storeApi, canvasId, sessionId, onLockLost]);

  return null;
}
```

- [ ] **Step 5: Drop `initialUpdatedAt` in the page**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`, change the `<Canvas>` render from
`<Canvas canvasId={canvas.id} initialUpdatedAt={canvas.updated_at} />` to:

```tsx
            <Canvas canvasId={canvas.id} />
```

- [ ] **Step 6: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/canvas-editable-context.tsx src/components/canvas/lock-banner.tsx src/components/canvas/canvas.tsx src/components/canvas/canvas-autosave.tsx "src/app/clients/[id]/canvases/[cid]/page.tsx"
git commit -m "feat(canvas): read-only Canvas + lock banner + autosave gating (D33)"
```

---

### Task 8: Strict read-only across inline edits + generation + approval

**Files:**
- Modify: `src/components/nodes/editable-field.tsx` (central inline-edit gate)
- Modify: focus views with generate/approve controls: `image-gen-focus-view.tsx`, `video-gen-focus-view.tsx`, `prompt-focus-view.tsx`, `video-prompt-focus-view.tsx`, `script-focus-view.tsx` (only those that exist)
- Modify: `src/components/nodes/inline-approval-bar.tsx`

**Interfaces:**
- Consumes: `useCanvasEditable()` (Task 7).

- [ ] **Step 1: Force `EditableField` read-only when the canvas isn't editable**

In `src/components/nodes/editable-field.tsx`, import the context and OR it into the existing `readOnly` prop so a single change disables every inline-edit field on a read-only canvas:

```ts
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
```
Then inside the component, right after destructuring props:
```ts
  const editable = useCanvasEditable();
  const isReadOnly = readOnly || !editable;
```
Replace the `if (readOnly) {` branch condition with `if (isReadOnly) {`. (Everything else stays.)

- [ ] **Step 2: Verify the shared field gate compiles + tests still pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: green. (`EditableField` is used widely; this one change makes all those fields read-only under the lock.)

- [ ] **Step 3: Gate generate + approval controls in the focus views**

For EACH focus view listed above that renders a generate button and/or `InlineApprovalBar`, add at the top of the component:

```ts
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
// …
const editable = useCanvasEditable();
```
Then:
- Add `|| !editable` to every generate/edit button's existing `disabled={…}` (e.g. `disabled={isGenerating || !editable}`). If a button has no `disabled`, add `disabled={!editable}`.
- Where `<InlineApprovalBar … canApprove={identity?.role === "senior"} … />` is rendered, change to `canApprove={editable && identity?.role === "senior"}` so approval is read-only under the lock (strict read-only).

Read each file first to find the exact button props; apply the pattern. Do not change any other behavior.

- [ ] **Step 4: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: green.

- [ ] **Step 5: Manual two-tab verification**

Apply migration `0010` to Supabase first. Start the app (`npm run dev`), set an identity via the gate, open the same canvas in two tabs (A first, then B):
1. **A is editor:** can drag/add/delete/edit/generate/approve; changes persist on reload.
2. **B is read-only:** shows the "{A's name} is editing" banner; drag/connect/delete disabled, inline fields are plain text, generate + approval disabled; "Take over" is disabled.
3. Close A (or leave idle ~45s). Within ~10s B's **"Take over editing"** enables; click it → B reloads as editor.
4. Back in A (if still open), make an edit → the save is rejected (`lockLost`) and A flips to the read-only banner.

Confirm all four before committing. If any fails, debug with `superpowers:systematic-debugging`.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/editable-field.tsx src/components/nodes/inline-approval-bar.tsx src/components/nodes/*focus-view.tsx
git commit -m "feat(canvas): strict read-only — gate inline edits, generation, approval (D33)"
```

---

### Task 9: ADR D33 + final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, after D32)

- [ ] **Step 1: Append the ADR entry**

In `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`, after the D32 entry in §7, add the **D33** entry (copy §9 of the design spec verbatim — the paragraph beginning "**D33 — Pessimistic single-writer canvas lock; retires D32's optimistic merge**").

- [ ] **Step 2: Final full verification**

Run: `npx vitest run`
Expected: PASS (all suites, including the new `lock-state` + updated `autosave-flush` + `canvas-store`).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D33 pessimistic canvas lock (supersedes D32)"
```

---

## Self-Review

**Spec coverage:**
- §3 data model (3 columns) → Task 1. ✓
- §3 constants (15s/45s) → Task 2. ✓
- §4 acquire/heartbeat/release/getLock (atomic) → Task 1 (RPC) + Task 3 (DB) + Task 4 (actions/route). ✓
- §5 server-enforced save + retire D32 (drop merge/token/replaceCanvas) → Task 5. ✓
- §6.1 pure lock state → Task 2. ✓
- §6.2 useCanvasLock (acquire/heartbeat/poll/takeover/release) → Task 6. ✓
- §6.3 strict read-only (RF interactions + autosave gate + banner + inline/generate/approval) → Task 7 (Canvas/banner/autosave) + Task 8 (fields/generate/approval). ✓
- §6.4 D29 composition (identity guaranteed; approval/generation gated by canEdit; server guard on save) → Task 6 (identity name) + Task 8 (approval/generate gate) + Task 5 (server guard). ✓
- §8 testing (isLockStale/lockReducer pure; flush; manual two-tab) → Task 2 + Task 5 + Task 8 Step 5. ✓
- §9 ADR D33 → Task 9. ✓

**Placeholder scan:** No TBD/TODO. Task 8 Step 3 is an explicit "apply this exact pattern to these named files" (pattern code shown) — acceptable, matches the repo's approval-plan precedent, not a placeholder.

**Type consistency:** `saveCanvasAction` return `{ ok: true } | { ok: false; lockLost: true }` and payload `{ …, sessionId }` are identical in Task 5 (definition), Task 5 flush (`typeof saveCanvasAction`), and Task 7 (component). `useCanvasLock` return shape (`canEdit`, `heldByName`, `canTakeOver`, `sessionId`, `takeOver`, `reportLockLost`) matches its consumers in Task 7. `LockEvent` variants used in Task 6 (`acquired`/`denied`/`heartbeatLost`/`tookOver`/`lockFreed`) all exist in Task 2. `getCanvasLockHolder` (Task 3) is consumed by Task 5. `useCanvasEditable` (Task 7) consumed by Task 8. Migration number `0010` consistent throughout.
