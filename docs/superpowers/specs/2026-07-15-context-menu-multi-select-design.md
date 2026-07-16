# Context menu multi-select actions — right-click on multi-selection

**Date:** 2026-07-15
**Status:** Spec
**Area:** Canvas → node context menus
**Extends:** `2026-06-11-duplicate-node-and-context-menu.md`, `2026-07-15-multi-select-duplicate-design.md`

## Problem

Right-clicking a node when multiple nodes are selected shows single-node actions only ("Duplicate", "Delete"). Users who select a group and right-click expect to act on the whole group, consistent with tools like Figma and Miro.

## Goals

- Right-clicking any node in a multi-selection shows "Duplicate N nodes" and "Delete N nodes" instead of the single-node labels.
- Both actions operate on the entire selection — same batch paths as `Ctrl+D` and keyboard Delete.
- Single-node behaviour is exactly unchanged — zero regressions.
- "Add Reference Image" is hidden when multiple nodes are selected (single-node only).

## Non-goals

- No new UI components beyond the label change in `NodeContextMenu`.
- No changes to the delete confirmation dialog (already handles plural count).
- No changes to `useDeleteNode` hook.
- No changes to API routes.

## Design

### 1. `NodeContextMenu` — additive prop

**File:** `src/components/nodes/node-context-menu.tsx`

Add one optional prop to the existing `Props` type:

```typescript
type Props = {
  children: React.ReactNode;
  onDuplicate: () => void;
  onDelete?: () => void;
  onAddReferenceImage?: () => void;
  selectedCount?: number; // total selected non-KB nodes; omit or 1 = single-node labels
};
```

Behaviour changes when `selectedCount > 1`:
- "Duplicate" label → "Duplicate {selectedCount} nodes"
- "Delete" label → "Delete {selectedCount} nodes"
- `onAddReferenceImage` item hidden (not rendered at all)
- Icons, shortcut hint (⌘D), and destructive styling are unchanged

When `selectedCount <= 1` or `undefined`, the menu renders exactly as today.

```tsx
export function NodeContextMenu({
  children,
  onDuplicate,
  onDelete,
  onAddReferenceImage,
  selectedCount,
}: Props) {
  const isMulti = (selectedCount ?? 1) > 1;

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 size-3.5" strokeWidth={1.5} />
          {isMulti ? `Duplicate ${selectedCount} nodes` : "Duplicate"}
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        {!isMulti && onAddReferenceImage && (
          <ContextMenuItem onClick={onAddReferenceImage}>
            <ImagePlus className="mr-2 size-3.5" strokeWidth={1.5} />
            Add Reference Image
          </ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="mr-2 size-3.5" strokeWidth={1.5} />
              {isMulti ? `Delete ${selectedCount} nodes` : "Delete"}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

---

### 2. Node components — selection awareness

**Files:** all 9 node components that use `NodeContextMenu`:
- `src/components/nodes/script-node.tsx`
- `src/components/nodes/file-node.tsx`
- `src/components/nodes/text-node.tsx`
- `src/components/nodes/prompt-node.tsx`
- `src/components/nodes/shot-node.tsx`
- `src/components/nodes/draw-node.tsx`
- `src/components/nodes/image-gen-node.tsx`
- `src/components/nodes/video-prompt-node.tsx`
- `src/components/nodes/video-gen-node.tsx`

Each node component adds these at the top of its render function, alongside existing store hooks:

```typescript
// Multi-select context menu
const canvasId = useCanvasId();
const allNodes = useCanvasStore((s) => s.nodes);
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow<AppNode>();

const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

The `NodeContextMenu` call is updated:

```tsx
<NodeContextMenu
  selectedCount={selectedCount}
  onDuplicate={() =>
    selectedCount > 1
      ? void duplicateNodes(selectedIds, canvasId)
      : void duplicateNode(id)
  }
  onDelete={() =>
    selectedCount > 1
      ? void deleteElements({ nodes: selectedIds.map((sid) => ({ id: sid })) })
      : deleteNode(id)
  }
  onAddReferenceImage={...} // unchanged where it exists
>
```

`useCanvasId` is imported from `@/components/canvas/canvas-id-context`.
`useReactFlow` is already imported in nodes that use `useDeleteNode` (which wraps it) — if not directly imported, add the import.

**Import rule:** `duplicateNode` (existing) and `duplicateNodes` (new) are both selected from `useCanvasStore`. `deleteNode` via `useDeleteNode()` is unchanged for the single path.

---

### 3. Delete confirmation — unchanged

`deleteElements({ nodes: [...] })` routes through React Flow's `onBeforeDelete` → `useDeleteConfirmation` → `DeleteConfirmDialog`. The dialog already renders "Delete N nodes?" for count > 1. No changes needed.

---

### 4. Edge cases

| Scenario | Behaviour |
|---|---|
| Right-click unselected node while others are selected | ReactFlow does NOT auto-select the right-clicked node. `selectedCount` reflects the existing selection. The right-clicked node's own ID is NOT included in `selectedIds` unless it was already selected. The multi-select action operates only on the already-selected nodes. This is acceptable — the user right-clicked outside their selection, so acting on the selection is correct. |
| Only KB nodes selected + right-click non-KB node | `selectedNonKbNodes` excludes KB nodes; count shows only non-KB selected nodes |
| Single node selected (or nothing selected) | `selectedCount` is 1 or 0; single-node labels shown; single-node actions called |
| Node with `onAddReferenceImage` in multi-select | Item hidden entirely |

---

## Files touched

| File | Change |
|---|---|
| `src/components/nodes/node-context-menu.tsx` | Add `selectedCount` prop, conditional labels |
| `src/components/nodes/script-node.tsx` | Add selectors + batch callbacks |
| `src/components/nodes/file-node.tsx` | Same |
| `src/components/nodes/text-node.tsx` | Same |
| `src/components/nodes/prompt-node.tsx` | Same |
| `src/components/nodes/shot-node.tsx` | Same |
| `src/components/nodes/draw-node.tsx` | Same |
| `src/components/nodes/image-gen-node.tsx` | Same |
| `src/components/nodes/video-prompt-node.tsx` | Same |
| `src/components/nodes/video-gen-node.tsx` | Same |
