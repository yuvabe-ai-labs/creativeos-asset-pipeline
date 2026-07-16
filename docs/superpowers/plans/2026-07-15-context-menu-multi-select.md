# Context Menu Multi-Select Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When multiple nodes are selected, right-clicking any node shows "Duplicate N nodes" and "Delete N nodes" in the context menu, operating on the full selection.

**Architecture:** `NodeContextMenu` gains an optional `selectedCount` prop that switches label text; each node component adds three store selectors (`allNodes`, `duplicateNodes`, `canvasId`) and passes `selectedCount` + updated callbacks to `NodeContextMenu`. Single-node behaviour is unchanged.

**Tech Stack:** React, Zustand (`useCanvasStore`), `@xyflow/react` (`useReactFlow`), TypeScript

---

## File Map

| File | Change |
|---|---|
| `src/components/nodes/node-context-menu.tsx` | Add `selectedCount` prop, conditional labels, hide `onAddReferenceImage` in multi |
| `src/components/nodes/script-node.tsx` | Add selectors + batch callbacks |
| `src/components/nodes/file-node.tsx` | Same |
| `src/components/nodes/text-node.tsx` | Same |
| `src/components/nodes/prompt-node.tsx` | Same |
| `src/components/nodes/shot-node.tsx` | Same |
| `src/components/nodes/draw-node.tsx` | Same |
| `src/components/nodes/image-gen-node.tsx` | Same |
| `src/components/nodes/video-prompt-node.tsx` | Same |
| `src/components/nodes/video-gen-node.tsx` | Same |

No new files. No API changes. No schema changes.

---

## Task 1: Update `NodeContextMenu` for multi-select labels

**Files:**
- Modify: `src/components/nodes/node-context-menu.tsx`

### Context

Current file is 48 lines. It renders Duplicate + optional AddReferenceImage + optional Delete. When `selectedCount > 1`, labels switch to "Duplicate N nodes" / "Delete N nodes" and `onAddReferenceImage` is hidden.

- [ ] **Step 1: Replace the full file content**

Write `src/components/nodes/node-context-menu.tsx` with this exact content:

```tsx
"use client";

import { Copy, ImagePlus, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type Props = {
  children: React.ReactNode;
  onDuplicate: () => void;
  onDelete?: () => void;
  onAddReferenceImage?: () => void;
  selectedCount?: number;
};

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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. Fix any before continuing.

- [ ] **Step 3: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/node-context-menu.tsx && git commit -m "feat: NodeContextMenu shows multi-select labels when selectedCount > 1"
```

---

## Task 2: Update `script-node.tsx`

**Files:**
- Modify: `src/components/nodes/script-node.tsx`

### Context

Current store hooks at top of `ScriptNode` (lines ~21-22):
```typescript
const deleteNode = useDeleteNode();
const duplicateNode = useCanvasStore((s) => s.duplicateNode);
```

Current `NodeContextMenu` usage (line ~39-42):
```tsx
<NodeContextMenu
  onDuplicate={() => duplicateNode(id)}
  onDelete={() => deleteNode(id)}
>
```

Needs: `useCanvasId` import, `useReactFlow` import (already has `@xyflow/react` imports), three new selectors, updated callbacks, `selectedCount` prop.

- [ ] **Step 1: Add imports**

Find the import block at the top of `src/components/nodes/script-node.tsx`. Add these two imports (they may not exist yet):

```typescript
import { useReactFlow } from "@xyflow/react";
import { useCanvasId } from "@/components/canvas/canvas-id-context";
```

Note: `@xyflow/react` is already imported for `Handle`, `Position`, `NodeProps` — add `useReactFlow` to that same import line.

- [ ] **Step 2: Add selectors inside the component**

Inside `ScriptNode`, after the existing store hooks (`deleteNode`, `duplicateNode`), add:

```typescript
const canvasId = useCanvasId();
const allNodes = useCanvasStore((s) => s.nodes);
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow();

const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

- [ ] **Step 3: Update `NodeContextMenu` props**

Find the `<NodeContextMenu` usage and update it to:

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
>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/script-node.tsx && git commit -m "feat: script-node context menu supports multi-select actions"
```

---

## Task 3: Update `file-node.tsx`

**Files:**
- Modify: `src/components/nodes/file-node.tsx`

### Context

Same pattern as Task 2. No `onAddReferenceImage` on this node.

- [ ] **Step 1: Add imports**

In `src/components/nodes/file-node.tsx`, add to the existing `@xyflow/react` import: `useReactFlow`. Add new import:

```typescript
import { useCanvasId } from "@/components/canvas/canvas-id-context";
```

- [ ] **Step 2: Add selectors**

After existing store hooks inside `FileNode`:

```typescript
const canvasId = useCanvasId();
const allNodes = useCanvasStore((s) => s.nodes);
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow();

const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

- [ ] **Step 3: Update `NodeContextMenu` props**

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
>
```

- [ ] **Step 4: Verify + Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/file-node.tsx && git commit -m "feat: file-node context menu supports multi-select actions"
```

---

## Task 4: Update `text-node.tsx`

**Files:**
- Modify: `src/components/nodes/text-node.tsx`

- [ ] **Step 1: Add imports**

Add `useReactFlow` to the `@xyflow/react` import line. Add:
```typescript
import { useCanvasId } from "@/components/canvas/canvas-id-context";
```

- [ ] **Step 2: Add selectors**

After existing store hooks inside `TextNode`:

```typescript
const canvasId = useCanvasId();
const allNodes = useCanvasStore((s) => s.nodes);
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow();

const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

- [ ] **Step 3: Update `NodeContextMenu` props**

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
>
```

- [ ] **Step 4: Verify + Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/text-node.tsx && git commit -m "feat: text-node context menu supports multi-select actions"
```

---

## Task 5: Update `prompt-node.tsx`

**Files:**
- Modify: `src/components/nodes/prompt-node.tsx`

- [ ] **Step 1: Add imports**

Add `useReactFlow` to the `@xyflow/react` import. Add:
```typescript
import { useCanvasId } from "@/components/canvas/canvas-id-context";
```

- [ ] **Step 2: Add selectors**

```typescript
const canvasId = useCanvasId();
const allNodes = useCanvasStore((s) => s.nodes);
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow();

const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

- [ ] **Step 3: Update `NodeContextMenu` props**

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
  onAddReferenceImage={...} // keep existing onAddReferenceImage prop unchanged if present
>
```

Check whether `prompt-node.tsx` currently passes `onAddReferenceImage` — keep it unchanged. Only `selectedCount`, `onDuplicate`, `onDelete` are modified.

- [ ] **Step 4: Verify + Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/prompt-node.tsx && git commit -m "feat: prompt-node context menu supports multi-select actions"
```

---

## Task 6: Update `shot-node.tsx`

**Files:**
- Modify: `src/components/nodes/shot-node.tsx`

- [ ] **Step 1: Add imports**

Add `useReactFlow` to the `@xyflow/react` import. Add:
```typescript
import { useCanvasId } from "@/components/canvas/canvas-id-context";
```

- [ ] **Step 2: Add selectors**

```typescript
const canvasId = useCanvasId();
const allNodes = useCanvasStore((s) => s.nodes);
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow();

const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

- [ ] **Step 3: Update `NodeContextMenu` props**

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
  onAddReferenceImage={...} // keep existing if present
>
```

- [ ] **Step 4: Verify + Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/shot-node.tsx && git commit -m "feat: shot-node context menu supports multi-select actions"
```

---

## Task 7: Update `draw-node.tsx`

**Files:**
- Modify: `src/components/nodes/draw-node.tsx`

- [ ] **Step 1: Add imports**

Add `useReactFlow` to the `@xyflow/react` import. Add:
```typescript
import { useCanvasId } from "@/components/canvas/canvas-id-context";
```

- [ ] **Step 2: Add selectors**

```typescript
const canvasId = useCanvasId();
const allNodes = useCanvasStore((s) => s.nodes);
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow();

const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

- [ ] **Step 3: Update `NodeContextMenu` props**

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
>
```

- [ ] **Step 4: Verify + Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/draw-node.tsx && git commit -m "feat: draw-node context menu supports multi-select actions"
```

---

## Task 8: Update `image-gen-node.tsx`

**Files:**
- Modify: `src/components/nodes/image-gen-node.tsx`

### Context

This node has `onAddReferenceImage` — it must stay unchanged and is automatically hidden by `NodeContextMenu` when `isMulti` is true.

- [ ] **Step 1: Add imports**

Add `useReactFlow` to the `@xyflow/react` import. Add:
```typescript
import { useCanvasId } from "@/components/canvas/canvas-id-context";
```

- [ ] **Step 2: Add selectors**

```typescript
const canvasId = useCanvasId();
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow();

const selectedNonKbNodes = nodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

Note: `image-gen-node.tsx` already reads `const nodes = useCanvasStore((s) => s.nodes)` at line ~31 — do NOT add another `allNodes` selector; reuse `nodes`.

- [ ] **Step 3: Update `NodeContextMenu` props**

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
  onAddReferenceImage={() =>
    gallery.openDrawer({
      position: { x: positionAbsoluteX ?? 0, y: positionAbsoluteY ?? 0 },
      connectToNodeId: id,
    })
  }
>
```

- [ ] **Step 4: Verify + Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/image-gen-node.tsx && git commit -m "feat: image-gen-node context menu supports multi-select actions"
```

---

## Task 9: Update `video-prompt-node.tsx` and `video-gen-node.tsx`

**Files:**
- Modify: `src/components/nodes/video-prompt-node.tsx`
- Modify: `src/components/nodes/video-gen-node.tsx`

Apply the same pattern as Tasks 2–7 to both files. Check each file first — if either already has `useReactFlow` imported, don't duplicate it.

- [ ] **Step 1: Add imports to `video-prompt-node.tsx`**

Add `useReactFlow` to `@xyflow/react` import if not present. Add:
```typescript
import { useCanvasId } from "@/components/canvas/canvas-id-context";
```

- [ ] **Step 2: Add selectors to `video-prompt-node.tsx`**

After existing store hooks:
```typescript
const canvasId = useCanvasId();
const allNodes = useCanvasStore((s) => s.nodes);
const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
const { deleteElements } = useReactFlow();

const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
const selectedCount = selectedNonKbNodes.length;
const selectedIds = selectedNonKbNodes.map((n) => n.id);
```

If the file already reads `nodes` from the store, use that variable name instead of `allNodes`.

- [ ] **Step 3: Update `NodeContextMenu` in `video-prompt-node.tsx`**

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
  onAddReferenceImage={...} // keep existing if present
>
```

- [ ] **Step 4: Repeat Steps 1–3 for `video-gen-node.tsx`**

Same pattern. Check if `nodes` is already read from store (reuse it). Keep any existing `onAddReferenceImage` unchanged.

- [ ] **Step 5: Verify + Commit both**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 | head -20
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/video-prompt-node.tsx src/components/nodes/video-gen-node.tsx && git commit -m "feat: video-prompt and video-gen nodes context menu supports multi-select actions"
```

---

## Notes for the implementer

**Variable name collision:** `image-gen-node.tsx` already uses `nodes` (from `useCanvasStore((s) => s.nodes)`). Reuse it — don't create a second `allNodes` selector. For all other nodes, use `allNodes` as the variable name to avoid any potential conflict with React Flow's internal `nodes` prop.

**`useReactFlow` requirement:** `useReactFlow` must be called inside a component that is a descendant of `<ReactFlowProvider>`. All canvas node components are rendered inside the provider, so this is safe.

**`deleteElements` vs `deleteNode`:** `deleteNode(id)` is a store action that bypasses React Flow. `deleteElements({ nodes: [...] })` routes through React Flow's `onBeforeDelete` gate (the confirmation dialog). The multi-select path MUST use `deleteElements` so the confirmation dialog fires. The single-select path continues to use the existing `deleteNode` from `useDeleteNode()` hook (which already uses `deleteElements` internally — see `src/hooks/use-delete-node.ts`).

**`onAddReferenceImage` in multi-select:** `NodeContextMenu` hides this item automatically when `isMulti` is true. No per-node conditional needed — just keep the prop as-is.
