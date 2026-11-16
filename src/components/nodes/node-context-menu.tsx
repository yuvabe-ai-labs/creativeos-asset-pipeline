"use client";

import { useRef, useState } from "react";
import { Copy, ImagePlus, Trash2 } from "lucide-react";
import { useNodeId, useReactFlow } from "@xyflow/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { useCanvasId } from "@/components/canvas/canvas-id-context";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { canDuplicateNode, type AppNode } from "@/lib/canvas-nodes";

type Props = {
  children: React.ReactNode;
  onDuplicate: () => void;
  onDelete?: () => void;
  onAddReferenceImage?: () => void;
  /** Node-specific items (ContextMenuItem), shown above Delete when one node is targeted. */
  extraItems?: React.ReactNode;
};

export function NodeContextMenu({ children, onDuplicate, onDelete, onAddReferenceImage, extraItems }: Props) {
  const storeApi = useCanvasStoreApi();
  const canvasId = useCanvasId();
  const { deleteElements } = useReactFlow<AppNode>();
  const editable = useCanvasEditable(); // D33: false when this session is read-only
  const nodeId = useNodeId();

  // Snapshot for rendering labels — updated synchronously at open time. snapshotCount is every
  // selected node (Delete acts on all of them); duplicableCount only those Duplicate can copy
  // (canDuplicateNode — e.g. the one Client review node per canvas is left out).
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [duplicableCount, setDuplicableCount] = useState(0);
  const [selfDuplicable, setSelfDuplicable] = useState(true);

  // Batch callbacks set at open time — stable refs, never stale.
  const batchDuplicate = useRef<(() => void) | null>(null);
  const batchDelete = useRef<(() => void) | null>(null);

  const isMulti = snapshotCount > 1;
  // Hidden, not disabled, for nodes that can't be copied: a dead item reads as a bug.
  const showDuplicate = isMulti ? duplicableCount > 0 : selfDuplicable;
  const hasItemsAbove = showDuplicate || (!isMulti && (Boolean(onAddReferenceImage) || Boolean(extraItems)));

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    // Read the store synchronously at the exact moment the menu opens.
    // This sidesteps the render-time stale state problem: ReactFlow may fire
    // a deselect change on right-click before the node component re-renders,
    // so reading at render time gives the wrong count. getState() is always fresh.
    const { nodes, duplicateNodes } = storeApi.getState();
    const selectedNodes = nodes.filter((n) => n.selected);
    const selected = selectedNodes.map((n) => n.id);
    const duplicable = selectedNodes.filter((n) => canDuplicateNode(n.type)).map((n) => n.id);
    const self = nodes.find((n) => n.id === nodeId);

    setSnapshotCount(selected.length);
    setDuplicableCount(duplicable.length);
    setSelfDuplicable(canDuplicateNode(self?.type));

    if (selected.length > 1) {
      batchDuplicate.current = duplicable.length ? () => void duplicateNodes(duplicable, canvasId) : null;
      batchDelete.current = () =>
        void deleteElements({ nodes: selected.map((id) => ({ id })) });
    } else {
      batchDuplicate.current = null;
      batchDelete.current = null;
    }
  };

  return (
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {showDuplicate && (
          <ContextMenuItem
            disabled={!editable}
            onClick={() => (batchDuplicate.current ?? onDuplicate)()}
          >
            <Copy className="mr-2 size-3.5" strokeWidth={1.5} />
            {isMulti ? (duplicableCount === 1 ? "Duplicate 1 node" : `Duplicate ${duplicableCount} nodes`) : "Duplicate"}
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {!isMulti && onAddReferenceImage && (
          <ContextMenuItem disabled={!editable} onClick={onAddReferenceImage}>
            <ImagePlus className="mr-2 size-3.5" strokeWidth={1.5} />
            Add Reference Image
          </ContextMenuItem>
        )}
        {!isMulti && extraItems}
        {onDelete && (
          <>
            {hasItemsAbove && <ContextMenuSeparator />}
            <ContextMenuItem variant="destructive" onClick={() => (batchDelete.current ?? onDelete)?.()}>
              <Trash2 className="mr-2 size-3.5" strokeWidth={1.5} />
              {isMulti ? `Delete ${snapshotCount} nodes` : "Delete"}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
