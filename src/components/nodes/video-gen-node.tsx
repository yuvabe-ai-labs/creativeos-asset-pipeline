"use client";

import { useState, useCallback } from "react";
import { GenerationLockLine } from "./generation-lock-line";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import type { VideoGenNodeData } from "@/lib/canvas-nodes";
import { VideoGenFocusView } from "./video-gen-focus-view";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import { GeneratingPlaceholder, GeneratingVeil } from "./node-generating";
import { ApprovalBadge } from "./approval-badge";
import type { ApprovalStatus } from "@/lib/approval";
import { useNodeCost } from "@/hooks/use-node-cost";
import { NodeCreditsFooter } from "./node-credits-footer";
import { useNodeMediaSize } from "@/hooks/use-node-media-size";
import { nodeMediaBox, parseAspectRatio } from "@/lib/canvas/media-fit";
import { NodeMedia } from "./node-media";

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
  const totalCredits = useNodeCost(id);

  const [focusOpen, setFocusOpen] = useState(false);
  const { isGenerating, isChangingVoice } = useGenerationStatus(id);
  // D384 — the card takes the video's shape; while generating, it reserves the chosen shape.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, parseAspectRatio((d.params as Record<string, unknown> | undefined)?.aspect_ratio));
  const box = videoUrl || isGenerating ? nodeMediaBox(media.ratio, "output") : null;

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
        style={box ? { width: box.cardWidth } : undefined}
        className={cn(
          !box && "w-60",
          "rounded-lg border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        {/* Header */}
        <NodeCardHeader
          icon={Clapperboard}
          nodeId={id}
          nodeType="video-gen"
          title={title}
          placeholder="Video Gen"
          onCommitTitle={(t) => updateNodeData(id, { title: t })}
          status={
            // While generating, the header carries no indicator — the Processing pill
            // sits on the card's bottom row instead, which also frees the full header
            // width for the title.
            isGenerating ? undefined : (
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  videoUrl ? "bg-primary" : "bg-muted-foreground/40",
                )}
                title={videoUrl ? "Video generated" : "Not generated"}
              />
            )
          }
        />

        {/* Body */}
        <div className="px-3 py-3">
          {!isGenerating && videoUrl && approvalStatus && (
            <div className="mb-2">
              <ApprovalBadge status={approvalStatus} />
            </div>
          )}
          {/* YUV-423 — the generating state sits centred on the media: over the current take,
              veiled (a voice change too, D284), or on a placeholder in its shape the first time. */}
          {isGenerating && !videoUrl && box && (
            <div className="mb-2"><GeneratingPlaceholder box={box} /></div>
          )}
          {videoUrl && box && (
            <div className="mb-2">
              <NodeMedia kind="video" src={videoUrl} alt={title || "Generated video"} box={box} onMeasured={media.onMeasured}>
                {isGenerating && <GeneratingVeil label={isChangingVoice ? "Changing voice…" : "Generating…"} />}
              </NodeMedia>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setFocusOpen(true)}
              className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
            >
              Open ↗
            </Button>
          </div>
        </div>

        <GenerationLockLine nodeId={id} />
        <NodeCreditsFooter totalCredits={totalCredits} hasOutput={Boolean(videoUrl)} />

        <Handle
          type="target"
          position={Position.Left}
          className="!size-4 !border-2 !border-card !bg-muted-foreground"
        />
        {/* D374 — its take feeds a Dubbing node. */}
        <Handle
          type="source"
          position={Position.Right}
          className="!size-4 !border-2 !border-card !bg-primary"
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
      voiceChange={d.voiceChange}
      onPatch={handlePatch}
    />
    </>
  );
}
