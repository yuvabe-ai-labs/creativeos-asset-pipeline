"use client";

import { useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { NodeContextMenu } from "./node-context-menu";
import { NodeHandle } from "./node-handle";
import type { VideoGenNodeData } from "@/lib/canvas-nodes";
import { VideoGenFocusView } from "./video-gen-focus-view";
import { useVideoGenStatus } from "@/hooks/use-video-gen-status";
import { ProcessingPill } from "./processing-pill";
import { ApprovalBadge } from "./approval-badge";
import type { ApprovalStatus } from "@/lib/approval";

export function VideoGenNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode    = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const gallery = useGalleryDrawer();
  const drop = useGalleryNodeDrop(id, {
    x: positionAbsoluteX ?? 0,
    y: positionAbsoluteY ?? 0,
  });
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  const d = data as VideoGenNodeData;
  const title    = d.title ?? "";
  const videoUrl = (d.parsed ?? null) as string | null;
  // D29: active version's approval status (present once a version exists).
  const approvalStatus = (d as { approvalStatus?: ApprovalStatus }).approvalStatus;

  const [focusOpen, setFocusOpen] = useState(false);
  const { isGenerating } = useVideoGenStatus(id);

  // Open when opened locally OR when the Generation Tray points `focusedNodeId` here.
  // Derived during render — no effect — so it never trips the set-state-in-effect rule.
  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null); // consume the tray signal
  };
  useFocusViewRegistration(id, focusViewOpen);

  const handlePatch = useCallback(
    (patch: Record<string, unknown>) => updateNodeData(id, patch),
    [id, updateNodeData],
  );

  return (
    <>
    <NodeContextMenu
      onDuplicate={() => duplicateNode(id)}
      onDelete={() => deleteNode(id)}
      onAddReferenceImage={() =>
        gallery.openDrawer({
          position: { x: positionAbsoluteX ?? 0, y: positionAbsoluteY ?? 0 },
          connectToNodeId: id,
        })
      }
    >
      <div
        onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
        onDragOver={drop.onDragOver}
        onDrop={drop.onDrop}
        className={cn(
          "w-60 rounded-lg border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Clapperboard className="size-3.5 shrink-0 stroke-[1.5] text-primary" />
            <span className="text-eyebrow !text-[0.65rem] whitespace-nowrap">Video Gen</span>
            <NodeHandle nodeId={id} nodeType="video-gen" />
          </div>
          {/* While generating, the header carries no indicator — the Processing pill
              sits on the card's bottom row instead. */}
          {!isGenerating && (
            <span
              className={cn(
                "size-1.5 rounded-full",
                videoUrl ? "bg-primary" : "bg-muted-foreground/40",
              )}
              title={videoUrl ? "Video generated" : "Not generated"}
            />
          )}
        </div>

        {/* Body */}
        <div className="px-3 py-3">
          {!isGenerating && videoUrl && approvalStatus && (
            <div className="mb-2">
              <ApprovalBadge status={approvalStatus} />
            </div>
          )}
          {isGenerating && (
            <div className="mb-2 h-16 w-full animate-pulse rounded-md bg-primary/10" />
          )}
          {!isGenerating && videoUrl && (
            <div className="mb-2 overflow-hidden rounded-md border border-border">
              <video
                src={videoUrl}
                className="h-16 w-full object-cover"
                muted
                playsInline
              />
            </div>
          )}
          {/* Open ↗ left, generation status right — ProcessingPill renders null when idle. */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setFocusOpen(true)}
              className="nodrag -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              Open ↗
            </button>
            <ProcessingPill processing={isGenerating} />
          </div>
        </div>


        {/* Leaf node — only a target handle, no source */}
        <Handle
          type="target"
          position={Position.Left}
          className="!size-4 !border-2 !border-card !bg-muted-foreground"
        />
      </div>
    </NodeContextMenu>

    {/* Outside NodeContextMenu: the portaled sheet still sits in the node's React tree,
        so as a child its contextmenu/dblclick/drop events bubbled into the node card. */}
    <VideoGenFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      nodeId={id}
      title={title}
      videoUrl={videoUrl}
      modelId={d.modelId}
      params={d.params}
      imageRoles={d.imageRoles ?? {}}
      onPatch={handlePatch}
    />
    </>
  );
}
