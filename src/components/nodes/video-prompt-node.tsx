"use client";

import { useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { savePromptOutputAction } from "@/lib/actions/nodes";
import { VideoPromptFocusView } from "./video-prompt-focus-view";
import { DEFAULT_IMAGE_PROMPT_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";
import type { VideoControls } from "@/lib/nodes/video-controls";
import type { VideoProvider } from "@/prompts/video-prompt-generate";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { ApprovalBadge } from "./approval-badge";
import type { ApprovalStatus } from "@/lib/approval";
import { useNodeCost } from "@/hooks/use-node-cost";
import { NodeCreditsFooter } from "./node-credits-footer";

const TYPE_LABEL: Record<string, string> = {
  script: "Script", text: "Note", prompt: "Prompt", kb: "Brand KB",
  file: "File", shot: "Shot", draw: "Sketch", "image-gen": "Image",
};

// Video Prompt node (D24). A compact launcher; double-click / Open hands off to the Video
// Prompt focus view. It vision-reads a connected Image Gen still and writes a motion prompt.
export function VideoPromptNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const gallery = useGalleryDrawer();
  const drop = useGalleryNodeDrop(id, {
    x: positionAbsoluteX ?? 0,
    y: positionAbsoluteY ?? 0,
  });
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const upstream = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const directNodes = nodes.filter((n) => sourceIds.includes(n.id));
    return directNodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      // An Image Gen still's URL lives in its active output (hydrated into data.parsed, D19).
      const fileUrl =
        n.type === "file" || n.type === "draw"
          ? (d.fileUrl as string | undefined)
          : n.type === "image-gen"
            ? (typeof d.parsed === "string" ? (d.parsed as string) : undefined)
            : undefined;
      const fileKind =
        n.type === "file" || n.type === "draw"
          ? (d.fileKind as string | undefined)
          : n.type === "image-gen"
            ? "image"
            : undefined;
      const typeLabel = TYPE_LABEL[n.type ?? ""] ?? String(n.type);
      return {
        id: n.id,
        label: (d.title as string | undefined)?.trim() || typeLabel,
        type: n.type ?? "",
        fileUrl,
        fileKind,
        useLlm: n.type === "file" ? (d.useLlm as boolean | undefined) : undefined,
      };
    });
  }, [nodes, edges, id]);

  const d = data as {
    title?: string;
    instruction?: string;
    parsed?: unknown;
    kbSlices?: KBSliceKey[];
    controls?: VideoControls;
    targetProvider?: VideoProvider;
  };
  const title = d.title ?? "";
  const instruction = d.instruction ?? "";
  const output = (d.parsed ?? null) as string | null;
  // D29: active version's approval status (present once a version exists).
  const approvalStatus = (d as { approvalStatus?: ApprovalStatus }).approvalStatus;
  const slices = d.kbSlices ?? DEFAULT_IMAGE_PROMPT_SLICES;
  const controls = d.controls ?? null;
  const totalCredits = useNodeCost(id);
  const [focusOpen, setFocusOpen] = useState(false);
  // Open locally (double-click / "Open ↗") OR when the guided flow points here (D35/D36).
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
      onAddReferenceImage={() =>
        gallery.openDrawer({
          position: { x: positionAbsoluteX ?? 0, y: positionAbsoluteY ?? 0 },
          connectToNodeId: id,
        })
      }
    >
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          setFocusOpen(true);
        }}
        onDragOver={drop.onDragOver}
        onDrop={drop.onDrop}
        className={cn(
          "w-44 rounded-lg border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        <NodeCardHeader
          icon={Clapperboard}
          nodeId={id}
          nodeType="video-prompt"
          title={title}
          placeholder="Motion prompt"
          onCommitTitle={(t) => updateNodeData(id, { title: t })}
          status={
            <span
              className={cn("size-1.5 rounded-full", output ? "bg-primary" : "bg-muted-foreground/40")}
              title={output ? "Generated" : "Not generated"}
            />
          }
        />

        <div className="px-3 py-3">
          {output && approvalStatus && (
            <div className="mb-2">
              <ApprovalBadge status={approvalStatus} />
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
          >
            Open ↗
          </Button>
        </div>

        <NodeCreditsFooter totalCredits={totalCredits} hasOutput={Boolean(output)} />

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

    {/* Outside NodeContextMenu: the portaled sheet still sits in the node's React tree,
        so as a child its contextmenu/dblclick/drop events bubbled into the node card. */}
    <VideoPromptFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      nodeId={id}
      title={title}
      instruction={instruction}
      output={output}
      slices={slices}
      controls={controls}
      targetProvider={d.targetProvider ?? null}
      upstream={upstream}
      onPatch={(patch) => updateNodeData(id, patch)}
      onSaveOutput={(o) => savePromptOutputAction(id, o)}
    />
    </>
  );
}
