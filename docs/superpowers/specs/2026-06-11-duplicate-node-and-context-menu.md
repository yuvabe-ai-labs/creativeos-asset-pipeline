# Duplicate node & context menu — canvas node actions

**Date:** 2026-06-11
**Status:** Implemented
**Area:** Canvas → node cards

## Problem

Nodes could not be duplicated. The only way to delete a node was via the hover `×` button or `Backspace` — no right-click affordance existed, and `Delete` was silently ignored. Canvas tools like Figma and Miro establish right-click as the canonical entry point for node actions; without it the canvas feels unfinished.

## Goals

- Right-click any script or file node → context menu with **Duplicate** and **Delete**.
- `Ctrl+D` / `⌘D` duplicates any selected non-KB node instantly.
- Both `Backspace` and `Delete` keys delete selected nodes/edges.
- KB nodes are excluded from all three paths (no context menu, Ctrl+D ignored, keyboard delete blocked by existing `deletable: false` flag).
- Hover `×` button removed — right-click and keyboard are the sole delete entry points.

## Non-goals

- No multi-node duplicate (single node per action; multi-select is a separate canvas feature).
- No undo for duplicate (deferred, same as delete).
- No edge duplication.
- No duplicate for KB nodes — they are canvas anchors bound to a specific brand KB instance.

## Design

### A. Store action

`duplicateNode(id)` added to `CanvasState` in `src/lib/canvas-store.ts`:

- Finds the node by id; returns early if not found or `type === "kb"`.
- Clones the node with a new `crypto.randomUUID()` id, position offset `+32 / +32`, and `selected: false`.
- Appended to `nodes[]` in a single `set` call — autosave picks it up on the 600 ms debounce.

No new server action. `CanvasAutosave` persists the clone through the existing `saveCanvasNodesAction` reconciliation.

### B. Right-click context menu

| File | Change |
|---|---|
| `src/components/ui/context-menu.tsx` | Installed via `npx shadcn@latest add context-menu` (Base UI registry) |
| `src/components/nodes/node-context-menu.tsx` | **New.** Reusable wrapper — `ContextMenuTrigger` around the node card, `ContextMenuContent` with Duplicate + optional Delete. |
| `src/components/nodes/script-node.tsx` | Wrapped return in `<NodeContextMenu>` |
| `src/components/nodes/file-node.tsx` | Same |

`NodeContextMenu` props: `{ onDuplicate, onDelete? }`. `onDelete` is optional so the same component can be used for KB nodes in future without conditionals at the call site. Destructive item uses the shadcn `variant="destructive"` built into `ContextMenuItem` — no manual className override needed.

`ContextMenuTrigger` renders without `asChild` (Base UI pattern; no extra DOM wrapper needed for React Flow drag correctness since drag is handled by React Flow's outer node container, not the custom node interior).

### C. Keyboard shortcuts

`deleteKeyCode={["Backspace", "Delete"]}` replaces the previous single-key prop in `<ReactFlow>` (`src/components/canvas/canvas.tsx`).

`Ctrl+D` / `⌘D` is handled via a `useEffect` in `Canvas`. A `useRef` holds the latest `nodes` array so the listener closure never goes stale without re-registering:

```ts
const nodesRef = useRef(nodes);
useEffect(() => { nodesRef.current = nodes; }, [nodes]);

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      e.preventDefault();
      nodesRef.current
        .filter((n) => n.selected && n.type !== "kb")
        .forEach((n) => duplicateNode(n.id));
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [duplicateNode]);
```

React Flow's built-in `deleteKeyCode` handles the `Delete` / `Backspace` path; no custom listener needed for those.

## Testing

```
npx tsc --noEmit
```

Manual acceptance path:
1. Right-click a script node → menu shows **Duplicate** (⌘D hint) and **Delete**.
2. Click **Duplicate** → clone appears offset 32 px down-right; original unchanged.
3. Select a node → `Ctrl+D` → same clone behaviour.
4. Select a node → `Delete` key (not Backspace) → node and connected edges removed.
5. Right-click a KB node → no context menu appears.
6. Select a KB node → `Ctrl+D` → nothing happens.
7. Wait 600 ms → reload → duplicated nodes persisted, deleted nodes absent.

## Design-system notes

Context menu uses the project's existing shadcn token set (`bg-popover`, `text-popover-foreground`, `text-destructive`). Icons are Lucide `Copy` and `Trash2` at `size-3.5`, `strokeWidth={1.5}` — consistent with the rest of the canvas UI.
