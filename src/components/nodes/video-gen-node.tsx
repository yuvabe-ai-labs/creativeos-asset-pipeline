"use client";

import { useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { NodeContextMenu } from "./node-context-menu";
import type { VideoGenNodeData } from "@/lib/canvas-nodes";
import { VideoGenFocusView } from "./video-gen-focus-view";
import { useVideoGenStatus } from "@/hooks/use-video-gen-status";
import { ProcessingPill } from "./processing-pill";
import { ApprovalBadge } from "./approval-badge";
import type { ApprovalStatus } from "@/lib/approval";

export function VideoGenNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode    = useCanvasStore((s) => s.deleteNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);

  const d = data as VideoGenNodeData;
  const title    = d.title ?? "";
  const videoUrl = (d.parsed ?? null) as string | null;
  // D29: active version's approval status (present once a version exists).
  const approvalStatus = (d as { approvalStatus?: ApprovalStatus }).approvalStatus;

  const [focusOpen, setFocusOpen] = useState(false);
  const { isGenerating } = useVideoGenStatus(id);

  const handlePatch = useCallback(
    (patch: Record<string, unknown>) => updateNodeData(id, patch),
    [id, updateNodeData],
  );

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
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
          </div>
          {isGenerating ? (
            <ProcessingPill processing />
          ) : (
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
          <button
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Open ↗
          </button>
        </div>

        <VideoGenFocusView
          open={focusOpen}
          onOpenChange={setFocusOpen}
          nodeId={id}
          title={title}
          videoUrl={videoUrl}
          modelId={d.modelId}
          params={d.params}
          imageRoles={d.imageRoles ?? {}}
          onPatch={handlePatch}
        />

        {/* Leaf node — only a target handle, no source */}
        <Handle
          type="target"
          position={Position.Left}
          className="!size-4 !border-2 !border-card !bg-muted-foreground"
        />
      </div>
    </NodeContextMenu>
  );
}
