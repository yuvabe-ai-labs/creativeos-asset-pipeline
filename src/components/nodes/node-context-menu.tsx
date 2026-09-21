"use client";

import { useRef, useState } from "react";
import { Copy, ImagePlus, Trash2 } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
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
import type { AppNode } from "@/lib/canvas-nodes";

type Props = {
  children: React.ReactNode;
  onDuplicate: () => void;
  onDelete?: () => void;
  onAddReferenceImage?: () => void;
};

export function NodeContextMenu({ children, onDuplicate, onDelete, onAddReferenceImage }: Props) {
  const storeApi = useCanvasStoreApi();
  const canvasId = useCanvasId();
  const { deleteElements } = useReactFlow<AppNode>();
  const editable = useCanvasEditable(); // D33: false when this session is read-only

  // Snapshot count for rendering labels — updated synchronously at open time.
  const [snapshotCount, setSnapshotCount] = useState(0);

  // Batch callbacks set at open time — stable refs, never stale.
  const batchDuplicate = useRef<(() => void) | null>(null);
  const batchDelete = useRef<(() => void) | null>(null);

  const isMulti = snapshotCount > 1;

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    // Read the store synchronously at the exact moment the menu opens.
    // This sidesteps the render-time stale state problem: ReactFlow may fire
    // a deselect change on right-click before the node component re-renders,
    // so reading at render time gives the wrong count. getState() is always fresh.
    const { nodes, duplicateNodes } = storeApi.getState();
    const selectedNodes = nodes.filter((n) => n.selected && n.type !== "kb");
    const selected = selectedNodes.map((n) => n.id);

    setSnapshotCount(selected.length);

    if (selected.length > 1) {
      batchDuplicate.current = () => void duplicateNodes(selected, canvasId);
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
        <ContextMenuItem
          disabled={!editable}
          onClick={() => (batchDuplicate.current ?? onDuplicate)()}
        >
          <Copy className="mr-2 size-3.5" strokeWidth={1.5} />
          {isMulti ? `Duplicate ${snapshotCount} nodes` : "Duplicate"}
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        {!isMulti && onAddReferenceImage && (
          <ContextMenuItem disabled={!editable} onClick={onAddReferenceImage}>
            <ImagePlus className="mr-2 size-3.5" strokeWidth={1.5} />
            Add Reference Image
          </ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
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
