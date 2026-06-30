# Canvas autosave: concurrency safety (Level 0 + Level 1)

**Date:** 2026-06-30
**Status:** Design approved; ready for implementation plan
**Touches:** `src/lib/db/nodes.ts`, `src/lib/db/edges.ts`, `src/lib/canvas-store.ts`,
`src/components/canvas/canvas-autosave.tsx`, `src/lib/actions/nodes.ts`,
`src/app/clients/[id]/canvases/[cid]/page.tsx`
**New ADR entries:** D30, D31 (append to staging-roadmap §7)

---

## 1. Problem

Autosave persists the **entire canvas as a snapshot** and **deletes any row the snapshot
doesn't contain**:

```ts
// src/lib/db/nodes.ts — saveCanvasNodes
upsert(rows)                                  // write every node I currently have
delete().eq("canvas_id", canvasId)
        .not("id", "in", `(${ids.join(",")})`) // ⚠️ delete every node NOT in my snapshot
```

`saveCanvasEdges` has the identical pattern. The autosave component
([canvas-autosave.tsx](../../../src/components/canvas/canvas-autosave.tsx)) fires this 600ms
after *any* change, sending the whole `nodes`/`edges` arrays from the Zustand store.

### Failure (two sessions — or one user in two tabs; identical bug)

1. Both load the canvas: nodes `{1, 2, 3}`.
2. Session **B** adds node `4` → store `{1, 2, 3, 4}` → autosaves.
3. Session **A** drags node `1` → store still `{1, 2, 3}` → autosaves 200ms later.
4. A's save upserts `1,2,3` **and runs `delete where id not in (1,2,3)`** → **node 4 is destroyed.**

This is worse than ordinary last-write-wins (stale data winning): the destructive reconcile
means whichever session saves last **actively deletes** rows the other session created. That
is the "autosave removes content" symptom.

The danger lives in the **delete clause, not the upsert**. Upserts only touch rows you name;
the `not in (…)` delete reaches out and clobbers rows you never saw.

## 2. Goals / non-goals

**Goals**
- **Level 0** — no autosave can delete a node/edge it didn't *explicitly* remove. (Kills the
  data loss.)
- **Level 1** — detect that the canvas changed elsewhere since load; on conflict, **save the
  local edits, then merge in the other session's additions** automatically, without a
  disruptive reload.

**Non-goals (explicitly out of scope)**
- Live presence / real-time streaming of changes (Supabase Realtime sync = "Level 2").
- Conflict-free same-field co-editing (CRDT / Yjs / Liveblocks = "Level 3").
- Per-node delta saves. We keep sending whole snapshots; we only make the **delete** safe.
  (Chosen for minimal change at MVP size — see §6 rejected alternatives.)

## 3. Approach (decided)

**Safe snapshot + `updated_at` optimistic-concurrency token + save-mine-then-merge.**

Keep the whole-snapshot upsert. Replace the blind "delete everything not in my snapshot"
with "delete only the ids I explicitly removed since load" (client-tracked tombstones). Use
the existing `canvases.updated_at` column as a concurrency token to detect overlap; on
conflict, force the local write through (safe, so the other session's nodes survive) and
return the freshly-merged canvas for the client to adopt.

## 4. Design

### 4.1 Level 0 — safe-snapshot writes

**Pure planner (testable without a DB).** New pure function:

```ts
// given the current snapshot and the ids the user explicitly removed since load,
// decide what to upsert and what to delete.
planReconcile(snapshotIds: string[], removedIds: string[]): { deleteIds: string[] }
// deleteIds = removedIds that are NOT in the snapshot (a removed-then-readded id stays)
```

`saveCanvasNodes` / `saveCanvasEdges` change signature to accept the removed ids and become
thin callers:

```ts
saveCanvasNodes(canvasId, nodes, removedNodeIds)
  → upsert(nodes)
  → if deleteIds.length: delete where canvas_id = canvasId AND id IN (deleteIds)
```

No more `not in (snapshot)`. A node another session added is never in *my* `removedNodeIds`,
so my save cannot touch it.

**Store tombstones** ([canvas-store.ts](../../../src/lib/canvas-store.ts)). `CanvasState`
gains:

- `removedNodeIds: string[]` and `removedEdgeIds: string[]` — appended whenever a
  node/edge leaves: in `onNodesChange` (`remove` changes **and** the cascaded edge removals),
  `onEdgesChange` (`remove` changes), and `deleteNode`.
- `clearRemoved(nodeIds: string[], edgeIds: string[])` — removes exactly the flushed ids from
  the tombstone lists (so ids removed *during* an in-flight save survive to the next flush).

**Seed path.** `createCanvasAction` calls `saveCanvasNodes`/`saveCanvasEdges` on a brand-new
empty canvas → passes empty `removedNodeIds`/`removedEdgeIds`.

### 4.2 Level 1 — conflict detection + merge

**Token.** `canvases.updated_at` (timestamptz), already bumped on every child write by the
triggers in [migration 0008](../../../supabase/migrations/0008_touch_canvas_updated_at.sql).
No new column, no migration.

**Threading the token.** The canvas page
([page.tsx](../../../src/app/clients/[id]/canvases/[cid]/page.tsx)) already loads the canvas
row via `getCanvasBySlug`; pass `canvas.updated_at` down to the autosave component as the
loaded token (via the store provider / `Canvas` prop). The autosave component holds it in a
`useRef` and refreshes it after every successful save.

**One combined server action** replaces the two separate `saveCanvasNodesAction` /
`saveCanvasEdgesAction`:

```ts
saveCanvasAction(canvasId, {
  nodes, edges, removedNodeIds, removedEdgeIds, expectedUpdatedAt
}): Promise<
  | { conflict: false; updatedAt: string }
  | { conflict: true;  updatedAt: string; fresh: { nodes: PersistedNode[]; edges: Edge[] } }
>
```

Logic:

1. `current ← SELECT updated_at FROM canvases WHERE id = canvasId`.
2. `conflict ← current !== expectedUpdatedAt`.
3. **Write mine regardless** — safe-snapshot writes from §4.1 (so a concurrent session's
   added nodes survive my write).
4. `newUpdatedAt ← SELECT updated_at …` (the writes just bumped it via triggers).
5. If `conflict`: refetch `listNodes` + `listEdges`. Because step 3 already wrote *my*
   version, the fresh state **is** the merge (mine ∪ their additions). Return it as `fresh`.
6. Return `{ conflict, updatedAt: newUpdatedAt, fresh? }`.

> The check-then-write is not a single DB transaction, so two writers can still interleave
> inside the millisecond window between step 1 and step 3. That is acceptable at MVP: the
> window is tiny, and safe-snapshot (§4.1) guarantees the worst case is a "mine-wins" field
> overwrite, never a deletion. A fully atomic version would move steps 1–4 into one Postgres
> function (RPC); deferred (YAGNI).

**Autosave component** ([canvas-autosave.tsx](../../../src/components/canvas/canvas-autosave.tsx)):

- Reads `nodes`, `edges`, `removedNodeIds`, `removedEdgeIds` from the store; holds
  `tokenRef` seeded from the loaded `updated_at`.
- On debounce flush: snapshot the four arrays, call `saveCanvasAction(canvasId, { …,
  expectedUpdatedAt: tokenRef.current })`.
- On resolve:
  - `tokenRef.current ← result.updatedAt`.
  - `store.clearRemoved(flushedRemovedNodeIds, flushedRemovedEdgeIds)`.
  - If `result.conflict`: `store.replaceCanvas(result.fresh.nodes → AppNode[], result.fresh.edges)`,
    preserving transient UI state (selection, `videoGenStatus`). The other session's additions
    appear silently (the chosen UX — no banner).
- Still best-effort: a thrown save is swallowed as today.

**`replaceCanvas(nodes, edges)`** — new store action that swaps `nodes`/`edges` wholesale but
leaves `videoGenStatus` and selection untouched. Used only by the merge.

## 5. Accepted limitations (record as ADR caveats)

- **Same-node edits → mine wins.** If both sessions edit the same node, the force-write in
  step 3 overwrites the other session's change to that node's `data`/`position`.
- **Delete-vs-edit → resurrect.** If the other session *deleted* a node I still hold, my
  force-write upserts it back. Both follow inevitably from "safe snapshot + mine wins"; true
  same-node merge is CRDT (Level 3), out of scope.
- **In-flight edit window.** Edits made during the save round-trip just before a `replaceCanvas`
  can be discarded by the merge. Tiny window; acceptable at MVP.

## 6. Rejected alternatives

- **Per-node delta saves** (track dirty ids, flush only changed nodes). More correct — never
  touches an untouched shared node — but adds dirty-tracking to the store and reshapes the
  action contract. Deferred: safe-snapshot fixes the actual data loss with far less churn.
- **New `version` integer column + atomic increment.** Cleaner concurrency semantics but
  needs a migration and an RPC/Postgres function to be truly atomic. `updated_at` already
  exists and is good enough to *detect* overlap. YAGNI.
- **Reload-button conflict UX** (stop autosaving, user clicks Reload, local edits discarded).
  Simpler, but loses in-flight work. Rejected in favor of save-mine-then-merge.
- **Silent auto-reload** (replace local with remote, no save). Throws away local edits
  mid-session. Rejected.

## 7. Testing (TDD)

- **`planReconcile` (pure):** snapshot `{1,2,3}` + removed `[]` ⇒ `deleteIds` excludes `4`
  (the exact regression test for this bug); removed `[2]` ⇒ `deleteIds = [2]`; removed id that
  was re-added ⇒ excluded from `deleteIds`.
- **Store (pure):** removing a node appends to `removedNodeIds` and cascades edge removals
  into `removedEdgeIds`; `clearRemoved(flushed)` drops only the flushed ids and preserves ids
  added mid-flight; `replaceCanvas` swaps nodes/edges but preserves `videoGenStatus`.
- **`saveCanvasAction` conflict branch:** stale `expectedUpdatedAt` ⇒ `conflict: true` with
  `fresh` returned, and a node added by the "other" writer is present in `fresh`. DB-touching;
  scoped to the existing Supabase test harness if one exists — confirmed during planning. The
  core delete-safety is fully covered by the pure `planReconcile` tests regardless.

## 8. ADR entries to append (staging-roadmap §7)

**D30 — Canvas autosave is non-destructive: delete only client-tracked tombstones**
*(builds on D8/D11)*. The whole-canvas snapshot save deletes only ids the client explicitly
removed since load, never "everything not in my snapshot." Rejected: per-node delta saves
(more churn, deferred). Why: a stale session's snapshot must never delete rows another session
created.

**D31 — Optimistic concurrency via `updated_at`; conflict = save-mine-then-merge**
*(builds on D30; the canvas-level complement to D11's "human is the scheduler")*. Saves carry
the `updated_at` loaded with the canvas; on mismatch the server force-writes the local edits
(safe per D30) and returns the merged canvas, which the client adopts silently. "Mine wins" on
same-node edits. Rejected: new `version` column + RPC (YAGNI), reload-button UX (loses work),
silent auto-reload (loses work). Real-time sync (Level 2) and CRDT same-field merge (Level 3)
remain future work.
