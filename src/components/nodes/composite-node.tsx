"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Combine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { useNodeCost } from "@/hooks/use-node-cost";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import type { CompositeNodeData } from "@/lib/canvas-nodes";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { NodeCreditsFooter } from "./node-credits-footer";
import { CompositeFocusView } from "./composite-focus-view";
import { ProcessingPill } from "./processing-pill";
import { useNodeMediaSize } from "@/hooks/use-node-media-size";
import { nodeMediaBox, parseAspectRatio } from "@/lib/canvas/media-fit";
import { NodeMedia } from "./node-media";

// D312 — the Composite card: the current image and a way in. Generation runs in the focus view.
export function CompositeNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const d = data as CompositeNodeData;
  const imageUrl = typeof d.parsed === "string" ? d.parsed : null;
  // D384 — the card takes the image's shape. Before the first load, the chosen aspect ratio.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, parseAspectRatio((d.params as Record<string, unknown> | undefined)?.aspect_ratio));
  const box = imageUrl ? nodeMediaBox(media.ratio, "output") : null;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const deleteNode = useDeleteNode();
  const gallery = useGalleryDrawer();
  const position = { x: positionAbsoluteX ?? 0, y: positionAbsoluteY ?? 0 };
  const drop = useGalleryNodeDrop(id, position);
  const totalCredits = useNodeCost(id);
  const [focusOpen, setFocusOpen] = useState(false);
  // D366 — the node's shared status, so the card shows a run in flight after the focus view closes.
  const { isGenerating: isProcessing } = useGenerationStatus(id);

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
  useFocusViewRegistration(id, focusViewOpen);

  return (
    <>
      <NodeContextMenu
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        onAddReferenceImage={() => gallery.openDrawer({ position, connectToNodeId: id })}
      >
        <div
          onDoubleClick={(e) => { e.stopPropagation(); setFocusOpen(true); }}
          onDragOver={drop.onDragOver}
          onDrop={drop.onDrop}
          style={box ? { width: box.cardWidth } : undefined}
          className={cn(
            !box && "w-[480px]",
            "rounded-lg border border-border bg-card shadow-card",
            "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        >
          <NodeCardHeader
            icon={Combine}
            nodeId={id}
            nodeType="composite"
            title={d.title ?? ""}
            placeholder="Composite"
            onCommitTitle={(t) => updateNodeData(id, { title: t })}
          />
          <div className="px-3 py-3">
            {imageUrl && box && (
              <div className="mb-2">
                <NodeMedia kind="image" src={imageUrl} alt="Composite" box={box} onMeasured={media.onMeasured} />
              </div>
            )}
            {/* Open ↗ left, generation status right — ProcessingPill renders null when idle. */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => setFocusOpen(true)}
                className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
              >
                Open ↗
              </Button>
              <ProcessingPill processing={isProcessing} />
            </div>
          </div>
          <NodeCreditsFooter totalCredits={totalCredits} hasOutput={Boolean(imageUrl)} />
          <Handle type="target" position={Position.Left} className="!size-4 !border-2 !border-card !bg-muted-foreground" />
          <Handle type="source" position={Position.Right} className="!size-4 !border-2 !border-card !bg-primary" />
        </div>
      </NodeContextMenu>

      {/* Outside NodeContextMenu: the sheet is portaled, but a portal keeps its place in the React
          tree, so as a child of the trigger its events would bubble into the card. */}
      <CompositeFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        title={d.title ?? ""}
        imageUrl={imageUrl}
        instruction={d.instruction ?? ""}
        modelId={d.modelId}
        params={d.params}
        onPatch={(patch) => updateNodeData(id, patch)}
      />
    </>
  );
}
