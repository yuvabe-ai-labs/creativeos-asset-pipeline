# Multi-Select Batch Duplicate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current fire-and-forget `forEach` duplicate loop with an atomic batch API route that duplicates multiple selected nodes (with inter-selection edges) all-or-nothing, and selects all copies after.

**Architecture:** A new `POST /api/nodes/duplicate-batch` route mirrors the existing single-node duplicate route's guarded version-copy logic, but handles N nodes in one DB transaction. A new `duplicateNodes(ids[])` store action replaces the `forEach` in `canvas.tsx`'s `Ctrl+D` handler; single-node `Ctrl+D` stays on the existing route unchanged.

**Tech Stack:** Next.js App Router (route handlers), Supabase (DB), Zustand (canvas store), `@xyflow/react`, TypeScript, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/app/api/nodes/duplicate-batch/route.ts` | **Create** — batch duplicate route |
| `src/lib/canvas-store.ts` | **Modify** — add `duplicateNodes` to `CanvasState` type + implementation |
| `src/components/canvas/canvas.tsx` | **Modify** — update `Ctrl+D` handler + store selector |

No new UI components. No schema changes.

---

## Task 1: Batch duplicate API route

**Files:**
- Create: `src/app/api/nodes/duplicate-batch/route.ts`

### Context

The existing single-node route lives at `src/app/api/nodes/[id]/duplicate/route.ts`. This task creates a sibling route for batch operations. Key patterns to follow:
- Use `withTryCatch` from `src/lib/api/route-helpers.ts` for top-level error handling
- Use `apiError` / `apiOk` — never `NextResponse.json(...)` directly
- Use `createServerSupabase` from `src/lib/supabase/server`
- Version copy is guarded: only update `active_version_id` if the DB update succeeds (prevents memory/DB mismatch)
- All-or-nothing: if any node insert fails, return 500 immediately

- [ ] **Step 1: Create the route file**

Create `src/app/api/nodes/duplicate-batch/route.ts` with this exact content:

```typescript
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";

type InternalEdge = { id: string; source: string; target: string };

type BatchDuplicateBody = {
  canvasId: string;
  nodeIds: string[];
  internalEdges: InternalEdge[];
};

export async function POST(req: Request) {
  return withTryCatch("Batch duplicate failed", async () => {
    const body = (await req.json()) as BatchDuplicateBody;
    const { canvasId, nodeIds, internalEdges } = body;

    if (!canvasId || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return apiError("canvasId and nodeIds are required.", 400);
    }

    const supabase = createServerSupabase();

    // 1. Fetch all source nodes — validate they belong to this canvas
    const { data: sourceNodes, error: fetchErr } = await supabase
      .from("nodes")
      .select("*")
      .in("id", nodeIds)
      .eq("canvas_id", canvasId);

    if (fetchErr || !sourceNodes) {
      return apiError("Failed to fetch source nodes.", 500);
    }

    // Silently skip KB nodes (defensive — client already filters them)
    const eligible = sourceNodes.filter((n) => n.type !== "kb");
    if (eligible.length === 0) {
      return apiOk({ nodes: [], edges: [] }, 201);
    }

    // 2. Build oldId → newId map
    const oldToNew = new Map<string, string>();
    for (const node of eligible) {
      oldToNew.set(node.id, crypto.randomUUID());
    }

    // 3. Insert all new nodes
    const newNodeRows = eligible.map((node) => {
      const position = node.position as { x: number; y: number };
      return {
        id: oldToNew.get(node.id)!,
        canvas_id: canvasId,
        type: node.type,
        position: { x: position.x + 32, y: position.y - 32 },
        data: node.data ?? {},
        active_version_id: null,
      };
    });

    const { data: insertedNodes, error: insertErr } = await supabase
      .from("nodes")
      .insert(newNodeRows)
      .select();

    if (insertErr || !insertedNodes) {
      return apiError("Failed to insert duplicate nodes.", 500);
    }

    // 4. Copy active versions (guarded — silent skip if version missing, never fail the batch)
    for (const sourceNode of eligible) {
      if (!sourceNode.active_version_id) continue;

      const newNodeId = oldToNew.get(sourceNode.id)!;

      const { data: activeVersion, error: versionErr } = await supabase
        .from("node_versions")
        .select("*")
        .eq("id", sourceNode.active_version_id)
        .single();

      if (versionErr || !activeVersion) continue; // silent skip

      const { data: newVersion, error: newVersionErr } = await supabase
        .from("node_versions")
        .insert({
          node_id: newNodeId,
          inputs_used: activeVersion.inputs_used ?? {},
          params_used: activeVersion.params_used ?? {},
          model_used: activeVersion.model_used ?? null,
          output: activeVersion.output ?? null,
          generated_output: activeVersion.generated_output ?? null,
          operator: "duplicate",
        })
        .select()
        .single();

      if (newVersionErr || !newVersion) continue; // silent skip

      const { error: updateErr } = await supabase
        .from("nodes")
        .update({ active_version_id: newVersion.id })
        .eq("id", newNodeId);

      if (!updateErr) {
        // Keep insertedNodes in sync (find and mutate the matching row)
        const row = insertedNodes.find((n) => n.id === newNodeId);
        if (row) row.active_version_id = newVersion.id;
      }
    }

    // 5. Remap and insert internal edges
    // Only remap edges where both endpoints are in the eligible set
    const eligibleIds = new Set(eligible.map((n) => n.id));
    const edgesToInsert = (internalEdges ?? [])
      .filter((e) => eligibleIds.has(e.source) && eligibleIds.has(e.target))
      .map((e) => ({
        id: crypto.randomUUID(),
        canvas_id: canvasId,
        source: oldToNew.get(e.source)!,
        target: oldToNew.get(e.target)!,
      }));

    let insertedEdges: typeof edgesToInsert = [];
    if (edgesToInsert.length > 0) {
      const { data: edgeData, error: edgeErr } = await supabase
        .from("edges")
        .insert(edgesToInsert)
        .select();

      if (edgeErr || !edgeData) {
        return apiError("Failed to insert duplicate edges.", 500);
      }
      insertedEdges = edgeData;
    }

    return apiOk({ nodes: insertedNodes, edges: insertedEdges }, 201);
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `duplicate-batch/route.ts`. Fix any type errors before proceeding.

- [ ] **Step 3: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/app/api/nodes/duplicate-batch/route.ts && git commit -m "feat: POST /api/nodes/duplicate-batch atomic batch duplicate route"
```

---

## Task 2: `duplicateNodes` store action

**Files:**
- Modify: `src/lib/canvas-store.ts`

### Context

The store's `CanvasState` type is defined at the top of `canvas-store.ts` (around line 27). The `duplicateNode` action is at line 179. Add `duplicateNodes` alongside it — both in the type and the implementation. The single-node `duplicateNode` remains unchanged.

The `canvasId` comes from `CanvasState` — but it isn't currently in the store. Check how `canvasId` is accessed in the autosave or other places. Looking at `canvas.tsx`, `canvasId` is a prop passed to `Canvas`, not stored in Zustand. So the `duplicateNodes` action needs to receive `canvasId` as a parameter.

- [ ] **Step 1: Add `duplicateNodes` to `CanvasState` type**

In `src/lib/canvas-store.ts`, find the `CanvasState` type (line ~27). Add `duplicateNodes` right after `duplicateNode`:

```typescript
  duplicateNode: (id: string) => Promise<void>;
  duplicateNodes: (ids: string[], canvasId: string) => Promise<void>;
```

- [ ] **Step 2: Add `duplicateNodes` implementation**

In `src/lib/canvas-store.ts`, find `duplicateNode: async (id) => {` (line ~179). Add the `duplicateNodes` implementation immediately after the closing `},` of `duplicateNode`:

```typescript
    duplicateNodes: async (ids, canvasId) => {
      // Filter KB nodes client-side (server also guards, but fail fast here)
      const eligible = ids.filter((id) => {
        const n = get().nodes.find((n) => n.id === id);
        return n && n.type !== "kb";
      });

      // Single-node fast path — preserves existing tested behaviour unchanged
      if (eligible.length === 1) {
        return get().duplicateNode(eligible[0]);
      }
      if (eligible.length === 0) return;

      // Resolve internal edges: both source and target must be in the selection
      const eligibleSet = new Set(eligible);
      const internalEdges = get()
        .edges.filter((e) => eligibleSet.has(e.source) && eligibleSet.has(e.target))
        .map((e) => ({ id: e.id, source: e.source, target: e.target }));

      try {
        const res = await fetch("/api/nodes/duplicate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canvasId, nodeIds: eligible, internalEdges }),
        });

        if (!res.ok) {
          toast.error("Couldn't duplicate nodes");
          return;
        }

        const { nodes: newNodes, edges: newEdges } = (await res.json()) as {
          nodes: { id: string; position: { x: number; y: number }; type: string; data: Record<string, unknown>; active_version_id: string | null }[];
          edges: { id: string; source: string; target: string }[];
        };

        // Find matching source nodes to merge client-side data (same pattern as duplicateNode)
        const sourceById = new Map(get().nodes.map((n) => [n.id, n]));

        // Build a mapping from new node id back to source node id via position offset
        // We need to reconstruct which new node maps to which source.
        // The server preserves insertion order matching eligible[], so zip by index.
        const newAppNodes = newNodes.map((newNode, i) => {
          const sourceId = eligible[i];
          const source = sourceById.get(sourceId);
          const data = { ...(source?.data as Record<string, unknown> ?? {}), ...(newNode.data as Record<string, unknown>) };
          return {
            ...(source ?? {}),
            id: newNode.id,
            position: newNode.position,
            data,
            selected: true,
          } as AppNode;
        });

        // Deselect originals, add all new nodes + remapped edges
        set({
          nodes: [
            ...get().nodes.map((n) => ({ ...n, selected: false })),
            ...newAppNodes,
          ],
          edges: [
            ...get().edges,
            ...newEdges.map((e) => ({ ...e })),
          ],
        });
      } catch (err) {
        console.error("Batch duplicate error:", err);
        toast.error("Couldn't duplicate nodes");
      }
    },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 4: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/lib/canvas-store.ts && git commit -m "feat: add duplicateNodes batch action to canvas store"
```

---

## Task 3: Wire `duplicateNodes` in canvas.tsx

**Files:**
- Modify: `src/components/canvas/canvas.tsx`

### Context

The `Ctrl+D` handler is inside a `useEffect` at line ~221. The store subscription is a `useShallow` selector at line ~93. `canvasId` is already a prop of the `Canvas` component (line ~66).

- [ ] **Step 1: Add `duplicateNodes` to the store selector**

In `src/components/canvas/canvas.tsx`, find the `useCanvasStore(useShallow(...))` block (lines ~93–105). Add `duplicateNodes` to the destructured values and to the selector:

```typescript
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    connectNodes,
    duplicateNode,
    duplicateNodes,
    updateNodeData,
    deleteNode,
  } = useCanvasStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      addNode: s.addNode,
      connectNodes: s.connectNodes,
      duplicateNode: s.duplicateNode,
      duplicateNodes: s.duplicateNodes,
      updateNodeData: s.updateNodeData,
      deleteNode: s.deleteNode,
    })),
  );
```

- [ ] **Step 2: Update the `Ctrl+D` handler**

Find the `Ctrl+D` block inside the `useEffect` keyboard handler (line ~224):

```typescript
      // Before — replace this entire block:
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        nodesRef.current
          .filter((n) => n.selected && n.type !== "kb")
          .forEach((n) => duplicateNode(n.id));
        return;
      }
```

Replace with:

```typescript
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        const selectedIds = nodesRef.current
          .filter((n) => n.selected && n.type !== "kb")
          .map((n) => n.id);
        void duplicateNodes(selectedIds, canvasId);
        return;
      }
```

- [ ] **Step 3: Add `duplicateNodes` to the `useEffect` dependency array**

Find the dependency array of the keyboard `useEffect` (line ~258). Add `duplicateNodes`:

```typescript
  }, [duplicateNode, duplicateNodes, openQuickAddAt, handleAddNode, pointerOrCenter]);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Fix any type errors.

- [ ] **Step 5: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/components/canvas/canvas.tsx && git commit -m "feat: wire duplicateNodes to Ctrl+D multi-select handler"
```

---

## Task 4: Manual smoke test

**No automated tests can exercise the full server+store integration in the current test setup (Vitest unit tests can't hit a real Supabase DB). Test manually.**

- [ ] **Step 1: Start the dev server**

```bash
cd e:/CreativeOS/creativeos-mvp && npm run dev
```

- [ ] **Step 2: Test single-node duplicate (regression)**

1. Open any canvas with at least one non-KB node.
2. Click a single node to select it.
3. Press `Ctrl+D`.
4. Expected: one copy appears offset `+32x, -32y` from the original, selected (original deselected). No errors in the browser console.

- [ ] **Step 3: Test multi-node duplicate — nodes only**

1. Box-drag to select 2–3 nodes that have no edges between them.
2. Press `Ctrl+D`.
3. Expected: all copies appear offset `+32x, -32y` from their originals, all new nodes selected, originals deselected. Check browser Network tab — one `POST /api/nodes/duplicate-batch` request, status 201.

- [ ] **Step 4: Test multi-node duplicate — with internal edges**

1. Find (or create) a `script → prompt` pair connected by an edge.
2. Box-drag to select both nodes.
3. Press `Ctrl+D`.
4. Expected: two copies appear, and a new edge connects `script-copy → prompt-copy`. The original edge is untouched. Verify in the canvas by connecting a node to confirm the new edge is real (drag from the copy's handle).

- [ ] **Step 5: Test KB node exclusion**

1. Select a KB node along with other nodes (box-drag).
2. Press `Ctrl+D`.
3. Expected: KB node is not duplicated. Other selected nodes are duplicated normally.

- [ ] **Step 6: Test group drag (already works — just confirm)**

1. Select multiple nodes via box-drag.
2. Drag any of them.
3. Expected: all selected nodes move together as a group.

- [ ] **Step 7: Commit confirmation**

If all smoke tests pass:

```bash
cd e:/CreativeOS/creativeos-mvp && git add -p && git commit -m "test: manual smoke test passed for multi-select duplicate"
```

(This is a no-op commit if no files changed — skip if nothing to add.)

---

## Notes for the implementer

**`duplicate-batch` returns nodes in insertion order matching `eligible[]`.** The store action zips `newNodes[i]` with `eligible[i]` to reconstruct which source maps to which copy. The server must not reorder the rows. Supabase `.insert([...]).select()` preserves insertion order, but if this ever breaks, the fix is to match by computing `oldId` from the position offset — or better, have the server return an `{ oldId, newId }` map.

**Edges in the store are ReactFlow `Edge` objects.** The batch route returns `{ id, source, target }` plain objects. The store spreads them into the `edges` array — ReactFlow will render them with default styles. This matches how `connectNodes` and `fanOutShots` add edges today.

**`canvasId` is not in the Zustand store.** It's a prop of `Canvas` and is passed explicitly to `duplicateNodes(ids, canvasId)`. This is consistent with how `saveCanvasNodesAction(canvasId, ...)` is called in `handlePasteImage`.
