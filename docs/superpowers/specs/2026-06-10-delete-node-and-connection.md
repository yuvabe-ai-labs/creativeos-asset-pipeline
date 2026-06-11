# Delete node & connection — canvas cleanup

**Date:** 2026-06-10
**Status:** Implemented
**Area:** Canvas → node cards + edges

## Problem

Nodes and edges could only be added to a canvas, never removed. Over time a canvas accumulates
stale script nodes, unused file nodes, and orphaned connections with no way to clean up. The
autosave reconciliation already handles DB cleanup (rows not in the current array are deleted on
the next save), so only the state actions and UI were missing.

## Goals

- Hover a script or file node → a `×` button appears in the card header → click deletes it instantly.
- Select any non-KB node → press `Backspace` → instant delete.
- Deleting a node also removes all edges connected to it (cascade).
- Select any edge → press `Backspace` → instant delete.
- KB nodes are protected: no delete button, keyboard delete ignored.

## Non-goals

- No undo/redo (deferred; can layer on later without changing the current shape).
- No confirmation dialog (instant delete matches Figma/Miro; undo is the right guard, not a dialog).
- No right-click context menu (can be added as a second entry point without touching this work).
- No multi-select batch delete (single-node delete first; multi-select is a separate canvas feature).
- Edge hover `×` button deferred — keyboard-only is sufficient for now.

## Design

### A. Store actions

Two changes to `canvas-store.ts`:

| Addition | What it does |
|---|---|
| `deleteNode(id)` | Filters the node out of `nodes[]` and removes all edges where `source === id` or `target === id` in one atomic `set`. |
| `onNodesChange` (updated) | Detects `type: "remove"` changes (from keyboard delete) and applies the same edge cascade before calling `applyNodeChanges`. |

The cascade lives in the store, not in any component, so both code paths (button click and keyboard) share the same logic.

### B. Keyboard delete

`deleteKeyCode="Backspace"` is added to `<ReactFlow>` in `canvas.tsx`. React Flow emits `"remove"` node/edge change events on keypress for any selected, deletable node or edge; the store's updated `onNodesChange` / existing `onEdgesChange` handle them.

KB node protection is enforced via `deletable: false` set on the node object itself inside `nodeRowToFlow` (in `canvas-nodes.ts`). React Flow skips `deletable: false` nodes during keyboard delete without any component-level guard needed.

### C. Components

| File | Change |
|---|---|
| `src/components/nodes/node-delete-button.tsx` | **New.** Reusable `×` button. `nodrag nopan` prevents canvas drag interference. Hidden (`invisible`) until the parent card's `group-hover` reveals it. |
| `src/components/nodes/script-node.tsx` | Added `group` class, `deleteNode` from store, `<NodeDeleteButton>` in the header right slot alongside the status dot. |
| `src/components/nodes/file-node.tsx` | Same as script-node. |
| `src/components/nodes/kb-node.tsx` | No changes. |
| `src/lib/canvas-nodes.ts` | `nodeRowToFlow` spreads `{ deletable: false }` for KB rows. |
| `src/lib/canvas-store.ts` | `deleteNode` action added; `onNodesChange` updated for cascade. |
| `src/components/canvas/canvas.tsx` | `deleteKeyCode="Backspace"` added to `<ReactFlow>`. |

### D. Data persistence

No new server action or API route. Deletion mutates the Zustand store; `CanvasAutosave` picks up the
change on its 600 ms debounce and calls the existing `saveCanvasNodesAction` / `saveCanvasEdgesAction`.
Whole-canvas reconciliation then deletes the removed rows from the DB (pre-existing behaviour).

## Testing

```
npx tsc --noEmit
npm run lint
```

Manual acceptance path:
1. Open a canvas with script, file, and KB nodes connected by edges.
2. Hover a script node → `×` appears in the header → click → node and its edges disappear.
3. Click a file node to select it → `Backspace` → instant delete with edge cascade.
4. Hover a KB node → no `×` button visible. Select it → `Backspace` → nothing happens.
5. Click an edge to select it → `Backspace` → edge removed, nodes untouched.
6. Wait 600 ms → reload the page → deleted nodes/edges are gone from DB.

## Design-system notes

The `×` button uses Lucide `X` at `size-3`, `strokeWidth={1.5}`, resting at
`text-muted-foreground/50` and transitioning to `text-destructive` on hover —
destructive intent is shown only at the moment of decision, not as ambient noise on every card.
Reveal uses the `invisible group-hover:visible` pattern with the project's standard
`200ms cubic-bezier(0.22,1,0.36,1)` easing.
