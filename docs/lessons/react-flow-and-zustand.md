# Lesson — React Flow + Zustand (how our canvas works)

*The mental model behind CreativeOS's node canvas, in one read.*
Ground truth & deeper docs: **https://reactflow.dev/learn** (follow it from the top).

---

## Part 1 — React Flow in four ideas

### 1. It's just two arrays you own
You hand React Flow `nodes` and `edges`; it draws them and handles pan/zoom/drag.
You own the data — it's a **controlled component** (like `<input value=… />`).

```ts
const nodes = [{ id: "1", position: { x: 0, y: 0 }, data: { label: "A" } }];
const edges = [{ id: "e1-2", source: "1", target: "2" }];
```
- A **node** = `{ id, position, data }`. `data` is a free-form bag — *you* decide its shape.
- An **edge** = `{ id, source, target }` (ids of the from/to nodes).
- Gotcha: the `<ReactFlow>` parent **must have a width and height**, and you import
  `@xyflow/react/dist/style.css` once.

### 2. Interactivity = "changes" you apply back
React Flow never mutates your arrays. When you drag/select/delete, it emits **changes**;
you fold them in and set state.

```tsx
onNodesChange={(changes) => setNodes(applyNodeChanges(changes, nodes))}
onEdgesChange={(changes) => setEdges(applyEdgeChanges(changes, edges))}
onConnect={(conn)       => setEdges(addEdge(conn, edges))}
```
Loop: **you interact → RF emits a change → you apply it → you set state → RF redraws.**

### 3. Custom nodes = your component under a name
```tsx
function BriefNode({ id, data, selected }) { … }   // gets ONLY these props
const nodeTypes = { brief: BriefNode };            // map: type string → component
<ReactFlow nodeTypes={nodeTypes} />                // node.type "brief" → <BriefNode/>
```
⚠️ `nodeTypes` must be a **stable reference** (module-level or `useMemo`). Inlining it
remounts every node on each render.

### 4. Handles = the in/out connection dots
```tsx
<Handle type="target" position={Position.Left} />   // IN  — connections land here
<Handle type="source" position={Position.Right} />  // OUT — connections start here
```
`source → target` is also the **data direction** (output feeds input).

---

## Part 2 — Zustand in three ideas

A tiny shared state container. **Pub/sub, just like a Svelte store** (`subscribe`/`set`),
with a React hook on top (`useSyncExternalStore`).

### 1. A store = values + functions
```ts
const useCounter = create((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}));
```

### 2. Read a *slice* with a selector
```tsx
const count = useCounter((s) => s.count);   // subscribes to just `count`
```
When `set` runs, only components whose **selected slice changed** re-render (`Object.is`).
No `<Provider>` required (unlike Context).

### 3. `useShallow` for multi-value selectors
Returning an object literal makes a **new reference every render**, so `Object.is` is always
false → re-renders on *every* store change. `useShallow` compares the object **field by
field** instead:
```tsx
useStore(useShallow((s) => ({ nodes: s.nodes, edges: s.edges })));
```
Rule: **single value → no wrap; object/array of several values → wrap in `useShallow`.**

---

## Part 3 — Why we combine them (the actual use case)

**The problem:** React Flow only passes a custom node `{ id, data, selected }` — *no callback
props*. So a node can't be handed an `onChange`; it's "trapped" and can't save its own edits.

**The fix:** the node reaches into a shared **Zustand store** and grabs the update function
directly (no props needed):
```tsx
const updateNodeData = useCanvasStore((s) => s.updateNodeData);
<input onChange={(e) => updateNodeData(id, { title: e.target.value })} />
```

**The one loop:**
```
        ┌──────────── Zustand store (shared) ────────────┐
        │  nodes[], edges[]  +  onNodesChange, addNode,   │
        │                       updateNodeData …          │
        └────────────────────────────────────────────────┘
            ▲ reads nodes/edges        ▲ writes (drag / add / edit)
        ┌───┴────────┐           ┌─────┴───────┐
        │ <ReactFlow>│           │ <BriefNode> │
        │  draws     │           │ edits self  │
        └────────────┘           └─────────────┘
```
- `<ReactFlow>` reads `nodes`/`edges` from the store and draws them.
- Dragging → `onNodesChange` writes new positions to the store.
- A node editing itself → `updateNodeData` writes to the same store.

One shared store; React Flow and the nodes both read and write it. Using plain `useState`
inside the canvas wouldn't work — a deep child node couldn't reach it.

---

## Part 4 — Cheat sheet & gotchas

| Do | Why |
|---|---|
| Keep `nodeTypes` a stable reference | Inlining remounts all nodes |
| Wrap multi-value selectors in `useShallow` | Avoid re-render on every store change |
| Select the **narrowest slice** a component needs | Fewer re-renders (a node that only takes `updateNodeData` won't re-render on drags) |
| Replace state immutably (`set({ nodes: [...] })`) | Makes reference/shallow comparison trustworthy |
| One store **per canvas** (provider keyed by canvas id) | Two canvases must not share one `nodes` array |

---

## Where this lives in our code
- Store: `src/lib/canvas-store.ts` (factory) + `src/components/canvas/canvas-store-provider.tsx` (per-canvas instance)
- Canvas: `src/components/canvas/canvas.tsx`
- Custom node: `src/components/nodes/brief-node.tsx`

**Read the official Learn path top-to-bottom for anything deeper:** https://reactflow.dev/learn
