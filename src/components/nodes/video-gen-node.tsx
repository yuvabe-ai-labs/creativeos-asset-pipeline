"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { NodeContextMenu } from "./node-context-menu";
import type { VideoGenNodeData } from "@/lib/canvas-nodes";
import { VideoGenFocusView } from "./video-gen-focus-view";

export function VideoGenNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode    = useCanvasStore((s) => s.deleteNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);

  const d = data as VideoGenNodeData;
  const title    = d.title ?? "";
  const videoUrl = (d.parsed ?? null) as string | null;
  const [focusOpen, setFocusOpen] = useState(false);

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
        className={cn(
          "w-44 rounded-lg border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Clapperboard className="size-3.5 stroke-[1.5] text-teal-500" />
            <span className="text-eyebrow !text-[0.65rem]">Video Gen</span>
          </div>
          <span
            className={cn(
              "size-1.5 rounded-full",
              videoUrl ? "bg-teal-500" : "bg-muted-foreground/40",
            )}
            title={videoUrl ? "Video generated" : "Not generated"}
          />
        </div>

        {/* Body */}
        <div className="px-3 py-3">
          {videoUrl && (
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
            className="nodrag -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-50"
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
          onPatch={(patch) => updateNodeData(id, patch)}
        />

        {/* Leaf node — only a target handle, no source */}
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2 !border-2 !border-card !bg-muted-foreground"
        />
      </div>
    </NodeContextMenu>
  );
}
