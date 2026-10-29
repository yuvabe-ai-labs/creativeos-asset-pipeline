"use client";

import { useMemo, useState } from "react";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import type { ImageGenNodeData } from "@/lib/canvas-nodes";
import { ImageGenFocusView } from "./image-gen-focus-view";
import { GeneratingPlaceholder, GeneratingVeil } from "./node-generating";
import { ApprovalBadge } from "./approval-badge";
import type { ApprovalStatus } from "@/lib/approval";
import { useNodeCost } from "@/hooks/use-node-cost";
import { NodeCreditsFooter } from "./node-credits-footer";
import { useNodeMediaSize } from "@/hooks/use-node-media-size";
import { nodeMediaBox, parseAspectRatio } from "@/lib/canvas/media-fit";
import { NodeMedia } from "./node-media";

export function ImageGenNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode    = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const gallery = useGalleryDrawer();
  const drop = useGalleryNodeDrop(id, {
    x: positionAbsoluteX ?? 0,
    y: positionAbsoluteY ?? 0,
  });

  // Select raw store slices (stable references) and derive the upstream list
  // with useMemo. Returning a freshly-built array of objects straight from the
  // selector breaks useSyncExternalStore caching → infinite-loop error.
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const canvasName = useCanvasStore((s) => s.canvasName);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  const { upstream, scriptTitle } = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const sourceNodes = nodes.filter((n) => sourceIds.includes(n.id));

    // Walk up one more level to find any script node grandparent for the filename
    const grandparentIds = edges
      .filter((e) => sourceIds.includes(e.target))
      .map((e) => e.source);
    const allAncestors = [...sourceNodes, ...nodes.filter((n) => grandparentIds.includes(n.id))];
    const scriptNode = allAncestors.find((n) => n.type === "script");
    const scriptTitle = scriptNode
      ? ((scriptNode.data as Record<string, unknown>).title as string | undefined) ?? ""
      : "";

    return {
      scriptTitle,
      upstream: sourceNodes.map((n) => {
        const d = n.data as Record<string, unknown>;
        return {
          id: n.id,
          type: n.type ?? "",
          fileUrl:
            n.type === "file" || n.type === "draw"
              ? (d.fileUrl as string | undefined)
              : n.type === "image-gen"
                ? (d.parsed as string | undefined)
                : undefined,
          fileKind:
            n.type === "file" || n.type === "draw"
              ? (d.fileKind as string | undefined)
              : n.type === "image-gen"
                ? "image"
                : undefined,
          fileSizeBytes: d.fileSizeBytes as number | undefined,
          imageWidth: d.imageWidth as number | undefined,
          imageHeight: d.imageHeight as number | undefined,
        };
      }),
    };
  }, [nodes, edges, id]);

  const d = data as ImageGenNodeData;
  const title    = d.title ?? "";
  const imageUrl = (d.parsed ?? null) as string | null;
  // D384 — the card takes the image's shape. Before the first load, the chosen aspect ratio.
  const media = useNodeMediaSize(id, { width: d.mediaWidth, height: d.mediaHeight }, parseAspectRatio((d.params as Record<string, unknown> | undefined)?.aspect_ratio));
  // D29: active version's approval status (present once a version exists).
  const approvalStatus = (d as { approvalStatus?: ApprovalStatus }).approvalStatus;
  const totalCredits = useNodeCost(id);
  const [focusOpen, setFocusOpen] = useState(false);
  // D366 — whether this node is generating, from its shared status (survives the focus view
  // closing, a reload, or leaving the canvas and coming back).
  const { isGenerating: isProcessing } = useGenerationStatus(id);
  // While generating with nothing to show yet, the card reserves the chosen shape for the placeholder.
  const box = imageUrl || isProcessing ? nodeMediaBox(media.ratio, "output") : null;

  // The focus view is open when opened locally (double-click / "Open ↗") OR when the
  // Generation Tray points `focusedNodeId` at this node. Derived during render — no
  // effect — so it never trips the set-state-in-effect rule.
  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null); // consume the tray signal
  };
  useFocusViewRegistration(id, focusViewOpen);

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
          !box && "w-[480px]",
          "rounded-lg border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        {/* Header */}
        <NodeCardHeader
          icon={ImageIcon}
          nodeId={id}
          nodeType="image-gen"
          title={title}
          placeholder="Image Gen"
          onCommitTitle={(t) => updateNodeData(id, { title: t })}
          status={
            // While processing, the header carries no indicator — the Processing pill
            // sits on the card's bottom row instead, which also frees the full header
            // width for the title.
            isProcessing ? undefined : (
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  imageUrl ? "bg-primary" : "bg-muted-foreground/40",
                )}
                title={imageUrl ? "Image generated" : "Not generated"}
              />
            )
          }
        />

        {/* Body */}
        <div className="px-3 py-3">
          {imageUrl && approvalStatus && (
            <div className="mb-2">
              <ApprovalBadge status={approvalStatus} />
            </div>
          )}
          {/* YUV-423 — the generating state sits centred on the image, as on every card. */}
          {isProcessing && !imageUrl && box && (
            <div className="mb-2"><GeneratingPlaceholder box={box} /></div>
          )}
          {imageUrl && box && (
            <div className="mb-2">
              <NodeMedia kind="image" src={imageUrl} alt="Generated" box={box} onMeasured={media.onMeasured}>
                {isProcessing && <GeneratingVeil />}
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

        <NodeCreditsFooter totalCredits={totalCredits} hasOutput={Boolean(imageUrl)} />

        <Handle
          type="target"
          position={Position.Left}
          className="!size-4 !border-2 !border-card !bg-muted-foreground"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!size-4 !border-2 !border-card !bg-primary"
        />
      </div>
    </NodeContextMenu>

    {/* Rendered OUTSIDE NodeContextMenu on purpose. The sheet is portaled to <body>,
        but a portal keeps its place in the React tree — so as a child of the trigger
        its contextmenu/dblclick/drop events bubbled back into the node card. */}
    <ImageGenFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      nodeId={id}
      title={title}
      canvasName={canvasName}
      scriptTitle={scriptTitle}
      imageUrl={imageUrl}
      modelId={d.modelId}
      params={d.params}
      editInstruction={d.editInstruction}
      editIntent={d.editIntent}
      editReferenceNodeIds={d.editReferenceNodeIds}
      baseReferenceNodeId={d.baseReferenceNodeId}
      upstream={upstream}
      onPatch={(patch) => updateNodeData(id, patch)}
    />
    </>
  );
}
