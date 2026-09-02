"use client";

import { useRef, useState } from "react";
import { Copy, ImagePlus, Trash2, Combine } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { canMergeShots } from "@/lib/nodes/merge-shots";
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
  // D202 — the merge offer for THIS selection, snapshotted alongside the count. `null` when the
  // selection is not all Shot nodes, so merge is absent rather than present-and-disabled for the
  // overwhelmingly common case of selecting things that are not shots.
  const [merge, setMerge] = useState<{ count: number; blockedReason: string | null } | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState(false);

  // Batch callbacks set at open time — stable refs, never stale.
  const batchDuplicate = useRef<(() => void) | null>(null);
  const batchDelete = useRef<(() => void) | null>(null);
  const batchMerge = useRef<(() => void) | null>(null);

  const isMulti = snapshotCount > 1;

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    // Read the store synchronously at the exact moment the menu opens.
    // This sidesteps the render-time stale state problem: ReactFlow may fire
    // a deselect change on right-click before the node component re-renders,
    // so reading at render time gives the wrong count. getState() is always fresh.
    const { nodes, duplicateNodes, mergeShotNodes } = storeApi.getState();
    const selectedNodes = nodes.filter((n) => n.selected && n.type !== "kb");
    const selected = selectedNodes.map((n) => n.id);

    setSnapshotCount(selected.length);

    // Offered only when EVERY selected node is a Shot. A selection mixing a Shot with a Prompt is
    // not a half-valid merge to explain — it is simply not a merge.
    const allShots = selected.length > 1 && selectedNodes.every((n) => n.type === "shot");
    if (allShots) {
      const shots = selectedNodes as Array<Extract<AppNode, { type: "shot" }>>;
      const verdict = canMergeShots(shots);
      setMerge({ count: shots.length, blockedReason: verdict.ok ? null : verdict.reason });
      batchMerge.current = verdict.ok ? () => mergeShotNodes(selected) : null;
    } else {
      setMerge(null);
      batchMerge.current = null;
    }

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
        {merge && (
          <ContextMenuItem
            disabled={!editable || !!merge.blockedReason}
            // The reason lives on the row rather than in a toast: a blocked merge is a fact about
            // the selection, and the operator is looking straight at the row when they find out.
            title={merge.blockedReason ?? undefined}
            onClick={() => setMergeConfirm(true)}
          >
            <Combine className="mr-2 size-3.5" strokeWidth={1.5} />
            {merge.blockedReason ? "Can't merge" : `Merge ${merge.count} shots`}
          </ContextMenuItem>
        )}
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

      {/* Merge replaces the selected nodes and drops their outgoing edges, so it is confirmed
          rather than immediate — the same treatment delete gets. */}
      <AlertDialog open={mergeConfirm} onOpenChange={setMergeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge {merge?.count ?? 0} shots into one?</AlertDialogTitle>
            <AlertDialogDescription>
              They become a single multishot node that generates as one clip with cuts between
              the beats, ordered as the script has them. Any motion prompt connected to these
              shots is disconnected — a prompt written for one beat does not describe the
              sequence. You can split it back apart with the multishot toggle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => batchMerge.current?.()}>Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  );
}
