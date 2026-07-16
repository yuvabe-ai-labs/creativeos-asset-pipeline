# Multi-select duplicate — canvas batch duplication

**Date:** 2026-07-15
**Status:** Spec
**Area:** Canvas → multi-node operations
**Extends:** `2026-06-11-duplicate-node-and-context-menu.md`

## Problem

`Ctrl+D` already iterates over selected nodes and calls `duplicateNode(id)` per node, but this fires N independent API calls with no atomicity guarantee. If any call fails mid-loop, the canvas is left in a partial state with no error surfaced to the user. Inter-selection edges are never copied, so duplicating a wired pair produces disconnected orphan copies.

## Goals

- `Ctrl+D` on a multi-selection duplicates all selected nodes atomically — either all succeed or none are applied.
- Edges between selected nodes are duplicated and rewired to the new copies.
- After duplication, all new nodes are selected; originals are deselected.
- New nodes land with the same relative spatial arrangement as the originals (`+32x, -32y` offset applied uniformly to preserve layout).
- All version-copy safety work Cyril landed (guarded `active_version_id` copy, incoming-only edge inheritance) is preserved exactly.
- KB nodes are always excluded — client-side and server-side guards both present.
- Single-node `Ctrl+D` is unchanged — still hits the existing `/api/nodes/[id]/duplicate` route.
- Group drag (moving a multi-selection together) already works via ReactFlow — no code needed.

## Non-goals

- No undo for batch duplicate (same policy as single-node duplicate).
- No clipboard copy/paste (separate future feature).
- No duplicate for KB nodes.
- No UI changes to the canvas surface — no new buttons, menus, or affordances.

## Design

### 1. Server — `POST /api/nodes/duplicate-batch`

**File:** `src/app/api/nodes/duplicate-batch/route.ts` (new)

**Request body:**
```ts
{
  canvasId: string;
  nodeIds: string[];   // IDs of nodes to duplicate (KB nodes filtered client-side already)
  internalEdges: {     // Full edge objects where both source and target are in nodeIds
    id: string;
    source: string;
    target: string;
  }[];
}
```

**Response:**
```ts
{
  nodes: PersistedNode[];  // All newly created nodes
  edges: PersistedEdge[];  // All newly created internal edges
}
```

**Server logic:**

1. Validate `canvasId` ownership via `withClient` helper pattern.
2. Fetch all source nodes from DB — skip any with `type = 'kb'` silently (defensive).
3. Build `oldId → newId` map: one `crypto.randomUUID()` per node.
4. For each node:
   - Insert duplicate at `position = { x: original.x + 32, y: original.y - 32 }`.
   - Copy active version using the exact guarded pattern from the single-node route:
     - Fetch `active_version_id` → if found, insert new version record with same `inputs_used`, `params_used`, `model_used`, `output`, `operator: "duplicate"`.
     - Update new node's `active_version_id` only if DB update succeeds (guard prevents memory/DB mismatch).
     - If version fetch or insert fails → silently skip, node has no active version. Never fail the batch over a missing version.
5. For each internal edge (received as full objects with `source`/`target`):
   - Insert new edge with `source = oldToNew[edge.source]`, `target = oldToNew[edge.target]`, new `id = crypto.randomUUID()`.
   - Preserve all other edge fields (style, animated, etc.).
6. If any node insert fails → return 500, persist nothing. Client receives single error, no partial state.
7. Return all new nodes and edges.

**Error contract:** All-or-nothing. No partial persistence on failure.

---

### 2. Store — `duplicateNodes(ids: string[])`

**File:** `src/lib/canvas-store.ts` (new action alongside existing `duplicateNode`)

```ts
duplicateNodes: async (ids: string[]) => {
  const { nodes, edges, canvasId } = get();

  // 1. Filter KB nodes
  const eligible = ids.filter(id => {
    const n = nodes.find(n => n.id === id);
    return n && n.type !== 'kb';
  });

  // 2. Single-node fast path — preserve existing tested behaviour
  if (eligible.length === 1) {
    return get().duplicateNode(eligible[0]);
  }
  if (eligible.length === 0) return;

  // 3. Resolve internal edges (both endpoints in selection)
  const eligibleSet = new Set(eligible);
  const internalEdges = edges.filter(
    e => eligibleSet.has(e.source) && eligibleSet.has(e.target)
  );

  // 4. Call batch route
  const res = await fetch('/api/nodes/duplicate-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      canvasId,
      nodeIds: eligible,
      internalEdges: internalEdges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    }),
  });

  if (!res.ok) {
    toast.error("Couldn't duplicate nodes");
    return;
  }

  const { nodes: newNodes, edges: newEdges } = await res.json();

  // 5. Apply to store atomically — deselect originals, select all new nodes
  set(state => ({
    nodes: [
      ...state.nodes.map(n => ({ ...n, selected: false })),
      ...newNodes.map(n => ({ ...n, selected: true })),
    ],
    edges: [...state.edges, ...newEdges],
  }));
}
```

---

### 3. Canvas — keyboard shortcut update

**File:** `src/components/canvas/canvas.tsx`

Replace the current `forEach` loop in the `Ctrl+D` handler:

```ts
// Before
nodesRef.current
  .filter((n) => n.selected && n.type !== "kb")
  .forEach((n) => duplicateNode(n.id));

// After
const selectedIds = nodesRef.current
  .filter((n) => n.selected && n.type !== "kb")
  .map((n) => n.id);
duplicateNodes(selectedIds);
```

`duplicateNodes` is added to the `useCanvasStore` subscription in the same `useShallow` selector block.

---

### 4. Group drag

No code changes. ReactFlow's `selectionOnDrag`, `SelectionMode.Partial`, and `nodesDraggable={canEdit}` already support dragging a multi-selection as a group. Verified working.

---

## Safety invariants preserved

| Invariant | How preserved |
|---|---|
| KB nodes never duplicated | Client filters before calling; server skips `type='kb'` rows |
| Version copy never fails the batch | Same guarded `if (!versionErr && activeVersion)` pattern from Cyril's fix |
| Memory/DB `active_version_id` mismatch prevented | Server only sets `newNode.active_version_id` after confirmed DB update |
| Incoming-only edge inheritance | Single-node route unchanged; batch route only copies listed `internalEdgeIds` |
| No partial duplicate state | Batch is all-or-nothing; single toast on failure |

## Files touched

| File | Change |
|---|---|
| `src/app/api/nodes/duplicate-batch/route.ts` | New route |
| `src/lib/canvas-store.ts` | New `duplicateNodes` action |
| `src/components/canvas/canvas.tsx` | ~5 line change in `Ctrl+D` handler + store selector |
