# Canvas Autosave Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvas autosave non-destructive (never delete a node/edge the client didn't explicitly remove) and conflict-aware (on overlap, save my edits then merge in the other session's additions).

**Architecture:** Replace the snapshot's blind `delete … NOT IN (snapshot)` with a delete of only client-tracked tombstones (a pure `planReconcile`). Track removed ids in the Zustand store. Replace the two autosave actions with one `saveCanvasAction` that uses `canvases.updated_at` as an optimistic-concurrency token; on mismatch it force-writes (safe) and returns the freshly-merged canvas, which the client adopts.

**Tech Stack:** Next.js (server actions), React Flow (`@xyflow/react`), Zustand (vanilla store), Supabase, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-30-canvas-autosave-concurrency-design.md](../specs/2026-06-30-canvas-autosave-concurrency-design.md)

## Global Constraints

- **No new DB column / migration.** Use the existing `canvases.updated_at` (bumped by triggers in migration 0008) as the concurrency token.
- **Pure decision logic lives outside `"server-only"` files** so Vitest can import it (server-only throws when imported in tests). `src/lib/db/nodes.ts` and `edges.ts` start with `import "server-only"`; the planner must NOT live there.
- **Autosave stays best-effort:** a thrown save is swallowed, never surfaced.
- **`data.parsed` is never persisted** — keep using `flowToPersisted` (D19). Don't touch that mapper.
- Follow existing patterns: one component/function per file, named exports, no `NextResponse.json` in actions.

---

## File Structure

- **Create** `src/lib/db/reconcile.ts` — pure `planReconcile(snapshotIds, removedIds)`.
- **Create** `src/lib/db/reconcile.test.ts` — its tests.
- **Modify** `src/lib/db/nodes.ts` — `saveCanvasNodes` gains optional `removedNodeIds`, uses `planReconcile`.
- **Modify** `src/lib/db/edges.ts` — `saveCanvasEdges` gains optional `removedEdgeIds`, uses `planReconcile`.
- **Modify** `src/lib/db/canvases.ts` — add `getCanvasUpdatedAt`.
- **Modify** `src/lib/canvas-store.ts` — tombstone lists, `clearRemoved`, `replaceCanvas`.
- **Create** `src/lib/canvas-store.test.ts` — store tombstone/clear/replace tests.
- **Modify** `src/lib/actions/nodes.ts` — add `saveCanvasAction`; remove dead `saveCanvasEdgesAction`.
- **Create** `src/components/canvas/autosave-flush.ts` — pure `runAutosaveFlush`.
- **Create** `src/components/canvas/autosave-flush.test.ts` — its tests.
- **Modify** `src/components/canvas/canvas-autosave.tsx` — subscribe + debounce + `runAutosaveFlush` + token ref.
- **Modify** `src/components/canvas/canvas.tsx` — accept + pass `initialUpdatedAt`.
- **Modify** `src/app/clients/[id]/canvases/[cid]/page.tsx` — pass `canvas.updated_at`.
- **Modify** `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` — append D30, D31.

---

### Task 1: Pure `planReconcile` + safe deletes in the DB layer

**Files:**
- Create: `src/lib/db/reconcile.ts`
- Test: `src/lib/db/reconcile.test.ts`
- Modify: `src/lib/db/nodes.ts:82-107` (`saveCanvasNodes`)
- Modify: `src/lib/db/edges.ts:37-62` (`saveCanvasEdges`)

**Interfaces:**
- Produces: `planReconcile(snapshotIds: string[], removedIds: string[]): { deleteIds: string[] }`
- Produces: `saveCanvasNodes(canvasId: string, nodes: PersistedNode[], removedNodeIds?: string[]): Promise<void>`
- Produces: `saveCanvasEdges(canvasId: string, edges: Edge[], removedEdgeIds?: string[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/reconcile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planReconcile } from "./reconcile";

describe("planReconcile", () => {
  it("never deletes a node that is not in my removed list (the regression case)", () => {
    // DB has {1,2,3,4}; my snapshot is {1,2,3} but I removed nothing.
    // Node 4 (added by another session) must NOT be deleted.
    const { deleteIds } = planReconcile(["1", "2", "3"], []);
    expect(deleteIds).toEqual([]);
  });

  it("deletes only ids I explicitly removed", () => {
    const { deleteIds } = planReconcile(["1", "3"], ["2"]);
    expect(deleteIds).toEqual(["2"]);
  });

  it("keeps a removed-then-readded id (still present in the snapshot)", () => {
    const { deleteIds } = planReconcile(["1", "2"], ["2"]);
    expect(deleteIds).toEqual([]);
  });

  it("dedupes repeated removed ids", () => {
    const { deleteIds } = planReconcile([], ["9", "9"]);
    expect(deleteIds).toEqual(["9"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db/reconcile.test.ts`
Expected: FAIL — `Failed to resolve import "./reconcile"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/db/reconcile.ts`:

```ts
// Pure reconcile planner. Given the ids currently on the canvas and the ids the
// client explicitly removed since load, decide which ids to delete. We delete ONLY
// ids the client removed AND that are not back on the canvas (a remove-then-readd
// keeps the row). Crucially we never delete by "absence from the snapshot", so a
// node another session added — which this client never saw — is never touched.
export function planReconcile(
  snapshotIds: string[],
  removedIds: string[],
): { deleteIds: string[] } {
  const present = new Set(snapshotIds);
  const deleteIds = [...new Set(removedIds)].filter((id) => !present.has(id));
  return { deleteIds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db/reconcile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor `saveCanvasNodes` to use it**

In `src/lib/db/nodes.ts`, add the import near the top (after the existing imports):

```ts
import { planReconcile } from "./reconcile";
```

Replace the whole `saveCanvasNodes` function (currently lines 82-107) with:

```ts
// Reconcile the DB with the current canvas: upsert everything present, delete ONLY
// the nodes the client explicitly removed since load (passed as removedNodeIds).
// No longer deletes "everything not in my snapshot" — so a stale session can never
// delete a node another session added.
export async function saveCanvasNodes(
  canvasId: string,
  nodes: PersistedNode[],
  removedNodeIds: string[] = [],
): Promise<void> {
  const supabase = createServerSupabase();

  if (nodes.length > 0) {
    const rows = nodes.map((n) => ({
      id: n.id,
      canvas_id: canvasId,
      type: n.type,
      position: n.position,
      data: n.data,
    }));
    const { error } = await supabase.from("nodes").upsert(rows); // on conflict (id)
    if (error) throw error;
  }

  const { deleteIds } = planReconcile(
    nodes.map((n) => n.id),
    removedNodeIds,
  );
  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("nodes")
      .delete()
      .eq("canvas_id", canvasId)
      .in("id", deleteIds);
    if (delErr) throw delErr;
  }
}
```

- [ ] **Step 6: Refactor `saveCanvasEdges` to use it**

In `src/lib/db/edges.ts`, add after the existing imports:

```ts
import { planReconcile } from "./reconcile";
```

Replace the whole `saveCanvasEdges` function (currently lines 37-62) with:

```ts
// Reconcile DB edges with the current canvas: upsert present, delete ONLY the edges
// the client explicitly removed since load (passed as removedEdgeIds).
export async function saveCanvasEdges(
  canvasId: string,
  edges: Edge[],
  removedEdgeIds: string[] = [],
): Promise<void> {
  const supabase = createServerSupabase();

  if (edges.length > 0) {
    const rows = edges.map((e) => ({
      id: e.id,
      canvas_id: canvasId,
      source_node_id: e.source,
      target_node_id: e.target,
      source_handle: e.sourceHandle ?? null,
      target_handle: e.targetHandle ?? null,
    }));
    const { error } = await supabase.from("edges").upsert(rows);
    if (error) throw error;
  }

  const { deleteIds } = planReconcile(
    edges.map((e) => e.id),
    removedEdgeIds,
  );
  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("edges")
      .delete()
      .eq("canvas_id", canvasId)
      .in("id", deleteIds);
    if (delErr) throw delErr;
  }
}
```

> The default `= []` means existing callers (`createCanvasAction`, `saveCanvasNodesAction`) keep compiling and become non-destructive automatically — they never delete anything now.

- [ ] **Step 7: Run the full suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS (existing tests + the 4 new ones).

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/reconcile.ts src/lib/db/reconcile.test.ts src/lib/db/nodes.ts src/lib/db/edges.ts
git commit -m "feat(canvas): non-destructive saves — delete only client-tracked tombstones (D30)"
```

---

### Task 2: Store tombstones, `clearRemoved`, `replaceCanvas`

**Files:**
- Modify: `src/lib/canvas-store.ts`
- Test: `src/lib/canvas-store.test.ts` (create)

**Interfaces:**
- Consumes: `createCanvasStore(initialNodes?, initialEdges?)`, `applyNodeChanges`, `applyEdgeChanges` (existing).
- Produces (added to `CanvasState`):
  - `removedNodeIds: string[]`
  - `removedEdgeIds: string[]`
  - `clearRemoved: (nodeIds: string[], edgeIds: string[]) => void`
  - `replaceCanvas: (nodes: AppNode[], edges: Edge[]) => void`

- [ ] **Step 1: Write the failing test**

Create `src/lib/canvas-store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createCanvasStore } from "./canvas-store";
import type { AppNode } from "./canvas-nodes";
import type { Edge } from "@xyflow/react";

function node(id: string): AppNode {
  return { id, type: "text", position: { x: 0, y: 0 }, data: {} } as AppNode;
}
function edge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

describe("canvas store — tombstones", () => {
  it("records a removed node and its cascaded edges", () => {
    const store = createCanvasStore(
      [node("a"), node("b")],
      [edge("e1", "a", "b")],
    );
    store.getState().deleteNode("a");
    expect(store.getState().removedNodeIds).toEqual(["a"]);
    expect(store.getState().removedEdgeIds).toEqual(["e1"]);
    expect(store.getState().nodes.map((n) => n.id)).toEqual(["b"]);
  });

  it("records a node removed via onNodesChange", () => {
    const store = createCanvasStore([node("a"), node("b")], []);
    store.getState().onNodesChange([{ type: "remove", id: "b" }]);
    expect(store.getState().removedNodeIds).toEqual(["b"]);
  });

  it("records an edge removed via onEdgesChange", () => {
    const store = createCanvasStore([], [edge("e9", "a", "b")]);
    store.getState().onEdgesChange([{ type: "remove", id: "e9" }]);
    expect(store.getState().removedEdgeIds).toEqual(["e9"]);
  });

  it("clearRemoved drops only the flushed ids, keeping ones added mid-flight", () => {
    const store = createCanvasStore([node("a"), node("b")], []);
    store.getState().deleteNode("a");
    store.getState().deleteNode("b");
    // flush only "a" — "b" was removed during the in-flight save
    store.getState().clearRemoved(["a"], []);
    expect(store.getState().removedNodeIds).toEqual(["b"]);
  });

  it("replaceCanvas swaps nodes/edges, clears tombstones, preserves videoGenStatus", () => {
    const store = createCanvasStore([node("a")], []);
    store.getState().setVideoGenError("a", "boom");
    store.getState().deleteNode("a");
    store.getState().replaceCanvas([node("x")], [edge("e2", "x", "x")]);
    expect(store.getState().nodes.map((n) => n.id)).toEqual(["x"]);
    expect(store.getState().edges.map((e) => e.id)).toEqual(["e2"]);
    expect(store.getState().removedNodeIds).toEqual([]);
    expect(store.getState().videoGenStatus["a"]?.lastError).toBe("boom");
  });

  it("replaceCanvas preserves selection by id", () => {
    const selected = { ...node("x"), selected: true } as AppNode;
    const store = createCanvasStore([selected], []);
    store.getState().replaceCanvas([node("x")], []);
    expect(store.getState().nodes[0].selected).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: FAIL — `removedNodeIds` is undefined / `clearRemoved is not a function`.

- [ ] **Step 3: Add the type members**

In `src/lib/canvas-store.ts`, add `EdgeRemoveChange` to the `@xyflow/react` type import (the block at lines 2-12), so it reads:

```ts
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeRemoveChange,
  type NodeRemoveChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react";
```

In the `CanvasState` type, after the `onConnect: OnConnect;` line, add:

```ts
  removedNodeIds: string[];
  removedEdgeIds: string[];
  clearRemoved: (nodeIds: string[], edgeIds: string[]) => void;
  replaceCanvas: (nodes: AppNode[], edges: Edge[]) => void;
```

- [ ] **Step 4: Seed the new state and rewrite the change handlers**

In `createCanvasStore`, set the initial tombstones right after `edges: initialEdges,`:

```ts
    removedNodeIds: [],
    removedEdgeIds: [],
```

Replace the `onNodesChange` handler with:

```ts
    onNodesChange: (changes) => {
      const removedIds = new Set(
        changes.filter((c): c is NodeRemoveChange => c.type === "remove").map((c) => c.id),
      );
      if (removedIds.size === 0) {
        set({ nodes: applyNodeChanges(changes, get().nodes) });
        return;
      }
      const cascadedEdges = get().edges.filter(
        (e) => removedIds.has(e.source) || removedIds.has(e.target),
      );
      set({
        nodes: applyNodeChanges(changes, get().nodes),
        edges: get().edges.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
        ),
        removedNodeIds: [...get().removedNodeIds, ...removedIds],
        removedEdgeIds: [...get().removedEdgeIds, ...cascadedEdges.map((e) => e.id)],
      });
    },
```

Replace the `onEdgesChange` handler with:

```ts
    onEdgesChange: (changes) => {
      const removedEdgeIds = changes
        .filter((c): c is EdgeRemoveChange => c.type === "remove")
        .map((c) => c.id);
      set({
        edges: applyEdgeChanges(changes, get().edges),
        ...(removedEdgeIds.length > 0 && {
          removedEdgeIds: [...get().removedEdgeIds, ...removedEdgeIds],
        }),
      });
    },
```

Replace the `deleteNode` handler with:

```ts
    deleteNode: (id) => {
      const cascadedEdges = get().edges.filter(
        (e) => e.source === id || e.target === id,
      );
      set({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        removedNodeIds: [...get().removedNodeIds, id],
        removedEdgeIds: [...get().removedEdgeIds, ...cascadedEdges.map((e) => e.id)],
      });
    },
```

- [ ] **Step 5: Add `clearRemoved` and `replaceCanvas`**

In `createCanvasStore`, add these two actions (e.g. right before `videoGenStatus: {},`):

```ts
    clearRemoved: (nodeIds, edgeIds) => {
      const n = new Set(nodeIds);
      const e = new Set(edgeIds);
      set({
        removedNodeIds: get().removedNodeIds.filter((id) => !n.has(id)),
        removedEdgeIds: get().removedEdgeIds.filter((id) => !e.has(id)),
      });
    },

    // Adopt a server-merged canvas (Level 1 conflict path). Swaps nodes/edges,
    // clears tombstones, preserves selection by id and leaves videoGenStatus alone.
    replaceCanvas: (nodes, edges) => {
      const selected = new Set(
        get().nodes.filter((n) => n.selected).map((n) => n.id),
      );
      set({
        nodes: nodes.map((n) =>
          selected.has(n.id) ? ({ ...n, selected: true } as AppNode) : n,
        ),
        edges,
        removedNodeIds: [],
        removedEdgeIds: [],
      });
    },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(canvas): track removed-node/edge tombstones + clearRemoved/replaceCanvas"
```

---

### Task 3: `getCanvasUpdatedAt` + combined `saveCanvasAction`

**Files:**
- Modify: `src/lib/db/canvases.ts` (add `getCanvasUpdatedAt`)
- Modify: `src/lib/actions/nodes.ts` (add `saveCanvasAction`, remove dead `saveCanvasEdgesAction`)

**Interfaces:**
- Consumes: `saveCanvasNodes`, `saveCanvasEdges` (Task 1), `listNodes`, `listEdges`, `nodeRowToFlow`.
- Produces: `getCanvasUpdatedAt(canvasId: string): Promise<string | null>`
- Produces:
  ```ts
  saveCanvasAction(canvasId: string, payload: {
    nodes: PersistedNode[];
    edges: Edge[];
    removedNodeIds: string[];
    removedEdgeIds: string[];
    expectedUpdatedAt: string;
  }): Promise<
    | { conflict: false; updatedAt: string }
    | { conflict: true; updatedAt: string; fresh: { nodes: AppNode[]; edges: Edge[] } }
  >
  ```

- [ ] **Step 1: Add `getCanvasUpdatedAt`**

In `src/lib/db/canvases.ts`, add:

```ts
// The concurrency token for autosave: the canvas's updated_at (bumped by the
// child-table triggers in migration 0008 on every node/edge/version write).
export async function getCanvasUpdatedAt(
  canvasId: string,
): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("updated_at")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}
```

(If `createServerSupabase` isn't already imported in this file, add `import { createServerSupabase } from "@/lib/supabase/server";` — check the top of the file first.)

- [ ] **Step 2: Add `saveCanvasAction` and remove the dead edges action**

In `src/lib/actions/nodes.ts`, update the imports to:

```ts
"use server";

import { saveCanvasNodes, listNodes, type PersistedNode } from "@/lib/db/nodes";
import { saveCanvasEdges, listEdges } from "@/lib/db/edges";
import { getCanvasUpdatedAt } from "@/lib/db/canvases";
import { updateActiveVersionOutput } from "@/lib/db/versions";
import { nodeRowToFlow, type AppNode } from "@/lib/canvas-nodes";
import type { Edge } from "@xyflow/react";
```

Keep `saveCanvasNodesAction` (the clipboard-paste path in `canvas.tsx` uses it). **Delete** the `saveCanvasEdgesAction` function. Add the new combined action:

```ts
// Combined, conflict-aware autosave (D31). Uses canvases.updated_at as an optimistic
// token. Writes my edits regardless (safe per D30, so another session's added nodes
// survive); on a token mismatch it refetches and returns the merged canvas — which,
// because my write already landed, is exactly mine ∪ their additions.
export async function saveCanvasAction(
  canvasId: string,
  payload: {
    nodes: PersistedNode[];
    edges: Edge[];
    removedNodeIds: string[];
    removedEdgeIds: string[];
    expectedUpdatedAt: string;
  },
): Promise<
  | { conflict: false; updatedAt: string }
  | { conflict: true; updatedAt: string; fresh: { nodes: AppNode[]; edges: Edge[] } }
> {
  const current = await getCanvasUpdatedAt(canvasId);
  const conflict = current !== payload.expectedUpdatedAt;

  await saveCanvasNodes(canvasId, payload.nodes, payload.removedNodeIds);
  await saveCanvasEdges(canvasId, payload.edges, payload.removedEdgeIds);

  const updatedAt = (await getCanvasUpdatedAt(canvasId)) ?? current ?? "";

  if (conflict) {
    const [rows, edges] = await Promise.all([listNodes(canvasId), listEdges(canvasId)]);
    return {
      conflict: true,
      updatedAt,
      fresh: { nodes: rows.map(nodeRowToFlow), edges },
    };
  }
  return { conflict: false, updatedAt };
}
```

- [ ] **Step 3: Confirm nothing else imported the deleted action**

Run: `grep -rn "saveCanvasEdgesAction" src/`
Expected: NO matches (only the now-deleted definition was using it; the old autosave that imported it is rewritten in Task 5). If a match remains outside `canvas-autosave.tsx`, stop and reconcile before continuing.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/components/canvas/canvas-autosave.tsx` (it still imports the old actions — fixed in Task 5). No errors elsewhere. If errors appear in any other file, fix them before committing.

> Note: `saveCanvasAction` is thin I/O glue over already-tested pieces (`planReconcile` in Task 1, the merge wiring in Task 4). Its conflict decision (`current !== expected`) is verified end-to-end by the Task 4 flush tests and the manual two-tab check in Task 5; it has no separate unit test because it only orchestrates DB calls.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/canvases.ts src/lib/actions/nodes.ts
git commit -m "feat(canvas): saveCanvasAction — updated_at conflict token + save-mine-then-merge (D31)"
```

---

### Task 4: Pure `runAutosaveFlush`

**Files:**
- Create: `src/components/canvas/autosave-flush.ts`
- Test: `src/components/canvas/autosave-flush.test.ts`

**Interfaces:**
- Consumes: `saveCanvasAction` (type only), `PersistedNode`, `Edge`, `AppNode`.
- Produces:
  ```ts
  type AutosaveSnapshot = {
    nodes: PersistedNode[]; edges: Edge[];
    removedNodeIds: string[]; removedEdgeIds: string[];
  };
  runAutosaveFlush(deps: {
    canvasId: string;
    snapshot: AutosaveSnapshot;
    expectedUpdatedAt: string;
    save: typeof saveCanvasAction;
    onSaved: (updatedAt: string, flushedNodeIds: string[], flushedEdgeIds: string[]) => void;
    onMerge: (fresh: { nodes: AppNode[]; edges: Edge[] }) => void;
  }): Promise<void>
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/canvas/autosave-flush.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runAutosaveFlush } from "./autosave-flush";
import type { saveCanvasAction } from "@/lib/actions/nodes";

const snapshot = {
  nodes: [],
  edges: [],
  removedNodeIds: ["n9"],
  removedEdgeIds: [],
};

function deps(save: unknown, onSaved = vi.fn(), onMerge = vi.fn()) {
  return {
    canvasId: "c1",
    snapshot,
    expectedUpdatedAt: "T1",
    save: save as typeof saveCanvasAction,
    onSaved,
    onMerge,
  };
}

describe("runAutosaveFlush", () => {
  it("refreshes the token and reports flushed tombstones on a clean save", async () => {
    const save = vi.fn().mockResolvedValue({ conflict: false, updatedAt: "T2" });
    const onSaved = vi.fn();
    const onMerge = vi.fn();
    await runAutosaveFlush(deps(save, onSaved, onMerge));
    expect(onSaved).toHaveBeenCalledWith("T2", ["n9"], []);
    expect(onMerge).not.toHaveBeenCalled();
  });

  it("merges the fresh canvas on conflict", async () => {
    const fresh = { nodes: [], edges: [] };
    const save = vi.fn().mockResolvedValue({ conflict: true, updatedAt: "T3", fresh });
    const onSaved = vi.fn();
    const onMerge = vi.fn();
    await runAutosaveFlush(deps(save, onSaved, onMerge));
    expect(onSaved).toHaveBeenCalledWith("T3", ["n9"], []);
    expect(onMerge).toHaveBeenCalledWith(fresh);
  });

  it("swallows save errors (best-effort) and calls nothing", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const onSaved = vi.fn();
    await expect(runAutosaveFlush(deps(save, onSaved))).resolves.toBeUndefined();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/canvas/autosave-flush.test.ts`
Expected: FAIL — `Failed to resolve import "./autosave-flush"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/canvas/autosave-flush.ts`:

```ts
import type { PersistedNode } from "@/lib/db/nodes";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { saveCanvasAction } from "@/lib/actions/nodes";

export type AutosaveSnapshot = {
  nodes: PersistedNode[];
  edges: Edge[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
};

// Pure autosave flush: send the snapshot via `save`, then report results back through
// callbacks. No React, no store — so it is unit-testable with a fake `save`. Errors are
// swallowed (autosave is best-effort).
export async function runAutosaveFlush(deps: {
  canvasId: string;
  snapshot: AutosaveSnapshot;
  expectedUpdatedAt: string;
  save: typeof saveCanvasAction;
  onSaved: (updatedAt: string, flushedNodeIds: string[], flushedEdgeIds: string[]) => void;
  onMerge: (fresh: { nodes: AppNode[]; edges: Edge[] }) => void;
}): Promise<void> {
  const { canvasId, snapshot, expectedUpdatedAt, save, onSaved, onMerge } = deps;
  try {
    const result = await save(canvasId, {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      removedNodeIds: snapshot.removedNodeIds,
      removedEdgeIds: snapshot.removedEdgeIds,
      expectedUpdatedAt,
    });
    onSaved(result.updatedAt, snapshot.removedNodeIds, snapshot.removedEdgeIds);
    if (result.conflict) onMerge(result.fresh);
  } catch {
    // best-effort autosave — swallow
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/canvas/autosave-flush.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/autosave-flush.ts src/components/canvas/autosave-flush.test.ts
git commit -m "feat(canvas): pure runAutosaveFlush (token refresh + conflict merge)"
```

---

### Task 5: Wire the autosave component + thread `initialUpdatedAt`

**Files:**
- Modify: `src/components/canvas/canvas-autosave.tsx` (full rewrite)
- Modify: `src/components/canvas/canvas.tsx:51` and `:281` (accept + pass prop)
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx:81` (pass `canvas.updated_at`)

**Interfaces:**
- Consumes: `runAutosaveFlush` (Task 4), `saveCanvasAction` (Task 3), `useCanvasStoreApi`, `flowToPersisted`.
- Produces: `<CanvasAutosave canvasId initialUpdatedAt />`; `Canvas({ canvasId, initialUpdatedAt })`.

- [ ] **Step 1: Rewrite `canvas-autosave.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasAction } from "@/lib/actions/nodes";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { runAutosaveFlush } from "./autosave-flush";

// Subscribes to the store; 600ms after the last node/edge change it flushes a
// conflict-aware save. The concurrency token (canvases.updated_at) lives in a ref,
// seeded from the value loaded with the page and refreshed after every save.
export function CanvasAutosave({
  canvasId,
  initialUpdatedAt,
}: {
  canvasId: string;
  initialUpdatedAt: string;
}) {
  const storeApi = useCanvasStoreApi();
  const tokenRef = useRef(initialUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = storeApi.subscribe((state, prev) => {
      // Only react to graph edits — ignore tombstone-only / videoGenStatus updates.
      if (state.nodes === prev.nodes && state.edges === prev.edges) return;
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
          expectedUpdatedAt: tokenRef.current,
          save: saveCanvasAction,
          onSaved: (updatedAt, flushedNodeIds, flushedEdgeIds) => {
            tokenRef.current = updatedAt;
            storeApi.getState().clearRemoved(flushedNodeIds, flushedEdgeIds);
          },
          onMerge: (fresh) => {
            storeApi.getState().replaceCanvas(fresh.nodes, fresh.edges);
          },
        });
      }, 600);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storeApi, canvasId]);

  return null;
}
```

> Why `subscribe` instead of the old selector `useEffect`: it fires only on real post-mount changes, so we no longer need the `firstRun` guard that skipped the initial DB-load render. The `nodes/edges` reference check keeps tombstone-only updates (from `clearRemoved`) from retriggering a save loop.

- [ ] **Step 2: Pass the prop from `Canvas`**

In `src/components/canvas/canvas.tsx`, change the signature (line ~51) from:

```tsx
export function Canvas({ canvasId }: { canvasId: string }) {
```

to:

```tsx
export function Canvas({
  canvasId,
  initialUpdatedAt,
}: {
  canvasId: string;
  initialUpdatedAt: string;
}) {
```

And change the render of `<CanvasAutosave>` (line ~281) from:

```tsx
      <CanvasAutosave canvasId={canvasId} />
```

to:

```tsx
      <CanvasAutosave canvasId={canvasId} initialUpdatedAt={initialUpdatedAt} />
```

- [ ] **Step 3: Pass the token from the page**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`, change the `<Canvas>` render (line ~81) from:

```tsx
          <Canvas canvasId={canvas.id} />
```

to:

```tsx
          <Canvas canvasId={canvas.id} initialUpdatedAt={canvas.updated_at} />
```

> `canvas` comes from `getCanvasBySlug` (`select *`), so `canvas.updated_at` is present. If `tsc` complains that `updated_at` is missing on `CanvasRow`, add `updated_at: string;` to the `CanvasRow` type in `src/lib/db/types.ts` and re-run — but `select *` means it should already be typed.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere now.

- [ ] **Step 5: Full test suite + lint**

Run: `npx vitest run`
Expected: PASS (all suites).

Run: `npm run lint`
Expected: no new errors in the files touched. (Pre-existing unrelated warnings, per project memory, are fine.)

- [ ] **Step 6: Manual two-tab verification**

Start the app (`npm run dev`), open the same canvas in two browser tabs (A and B):

1. In **B**, add a node; wait ~1s for autosave.
2. In **A** (which never saw B's node), drag an existing node; wait ~1s.
3. **Reload A.** B's node must still be there (Level 0 — no destructive delete).
4. Keep both open: add a node in B (~1s), then make any edit in A (~1s). Within a moment B's node should appear in A **without a reload** (Level 1 merge).

Confirm both behaviors before committing. If either fails, debug with `superpowers:systematic-debugging` before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/canvas-autosave.tsx src/components/canvas/canvas.tsx "src/app/clients/[id]/canvases/[cid]/page.tsx"
git commit -m "feat(canvas): conflict-aware autosave wiring + updated_at token threading"
```

---

### Task 6: Record ADRs D30/D31 + final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, after D29)

- [ ] **Step 1: Append the ADR entries**

In `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`, after the D29 entry in §7, add:

```markdown
### D30 — Canvas autosave is non-destructive: delete only client-tracked tombstones *(recorded 2026-06-30; builds on D8/D11)*

The whole-canvas snapshot save deletes only ids the client explicitly removed since
load (tracked as tombstones in the store), never "everything not in my snapshot."
**Why:** a stale session's snapshot must never delete rows another session created —
the old `delete … NOT IN (snapshot)` made every client an authority on the entire
canvas, so the last writer erased the other's nodes. **Rejected:** per-node delta
saves (more correct but more churn — deferred). **Originated:** `docs/superpowers/specs/2026-06-30-canvas-autosave-concurrency-design.md`.

### D31 — Optimistic concurrency via `updated_at`; conflict = save-mine-then-merge *(recorded 2026-06-30; builds on D30; canvas-level complement to D11)*

Autosave carries the `canvases.updated_at` loaded with the canvas as an optimistic
token. On mismatch the server force-writes the local edits (safe per D30, so the other
session's added nodes survive) and returns the refetched canvas, which the client
adopts silently. "Mine wins" on a node both sessions edited; a node the other session
deleted but I still hold is resurrected — both inherent to safe-snapshot + mine-wins.
**Rejected:** a new `version` column + RPC (YAGNI — `updated_at` already detects
overlap), a Reload-button UX (loses in-flight work), silent auto-reload (loses work).
**Deferred:** real-time sync (Level 2) and CRDT same-field merge (Level 3).
**Originated:** `docs/superpowers/specs/2026-06-30-canvas-autosave-concurrency-design.md`.
```

- [ ] **Step 2: Final full verification**

Run: `npx vitest run`
Expected: PASS (all suites).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D30 non-destructive autosave, D31 updated_at conflict token"
```

---

## Self-Review

**Spec coverage:**
- §4.1 safe-snapshot writes → Task 1 (`planReconcile` + `saveCanvasNodes`/`saveCanvasEdges`). ✓
- §4.1 store tombstones / `clearRemoved` → Task 2. ✓
- §4.2 token + combined `saveCanvasAction` + merge → Task 3. ✓
- §4.2 `replaceCanvas` preserve selection/videoGenStatus → Task 2 (impl + tests). ✓
- §4.2 autosave component wiring + token threading → Task 5. ✓
- §7 testing (pure `planReconcile`, store, flush; conflict branch via flush + manual) → Tasks 1, 2, 4, 5. ✓
- §8 ADR D30/D31 → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. ✓

**Type consistency:** `planReconcile(snapshotIds, removedIds) → { deleteIds }` consistent across Tasks 1/usage. `saveCanvasAction` payload + return shape identical in Tasks 3, 4 (`save: typeof saveCanvasAction`), 5. `clearRemoved(nodeIds, edgeIds)` and `replaceCanvas(nodes, edges)` consistent across Tasks 2, 5. `runAutosaveFlush` deps identical in Tasks 4, 5. ✓
