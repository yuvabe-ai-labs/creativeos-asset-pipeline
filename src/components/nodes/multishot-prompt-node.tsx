"use client";

import { useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ListVideo } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { NodeCreditsFooter } from "./node-credits-footer";
import { useNodeCost } from "@/hooks/use-node-cost";
import type { MultishotNodeData, MultishotPromptNodeData } from "@/lib/canvas-nodes";
import type { MultishotPlan } from "@/lib/nodes/multishot-plan";

// Multishot Prompt node (D210). Sibling of the Video Prompt node's compact launcher (same
// NodeCardHeader/NodeContextMenu/handle structure), but its body summarises a structured
// MultishotPlan instead of a single prompt string: how many beats the writer produced, the
// budget it wrote against (read from the upstream Multishot node — this node has no budget of
// its own), and the look block's opening line once a plan exists.
//
// This task ships the canvas card only. The three-column input/output editor (§8 of
// docs/superpowers/specs/2026-09-02-multishot-node-types-design.md) — per-cut instructions, the
// chip editor, per-beat re-run — is later work; there is no focus view to open yet, so unlike
// VideoPromptNode this card has no "Open ↗" affordance.
export function MultishotPromptNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
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

  // The budget comes from the connected Multishot node (D209) — a fixed number of seconds
  // divided into cuts. This node only ever writes against that budget, never sets it.
  const budget = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const multishot = nodes.find((n) => sourceIds.includes(n.id) && n.type === "multishot");
    return (multishot?.data as MultishotNodeData | undefined)?.totalSeconds;
  }, [nodes, edges, id]);

  const d = data as MultishotPromptNodeData;
  const title = d.title ?? "";
  const plan = d.parsed as MultishotPlan | undefined;
  const status = plan ? `${plan.beats.length} beats` : "Not written yet";
  const lookFirstLine = plan?.look.split("\n")[0]?.trim();
  const totalCredits = useNodeCost(id);

  return (
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
        onDragOver={drop.onDragOver}
        onDrop={drop.onDrop}
        className={cn(
          "w-56 rounded-lg border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
      >
        <NodeCardHeader
          icon={ListVideo}
          nodeId={id}
          nodeType="multishot-prompt"
          title={title}
          placeholder="Multishot prompt"
          onCommitTitle={(t) => updateNodeData(id, { title: t })}
          status={
            <span
              className={cn("size-1.5 rounded-full", plan ? "bg-primary" : "bg-muted-foreground/40")}
              title={plan ? "Generated" : "Not generated"}
            />
          }
        />

        <div className="px-3 py-3">
          <p className="text-[0.65rem] text-muted-foreground">
            {status}
            {typeof budget === "number" ? ` · ${budget}s budget` : ""}
          </p>
          {lookFirstLine && (
            <p className="mt-1.5 truncate text-xs text-foreground" title={lookFirstLine}>
              {lookFirstLine}
            </p>
          )}
        </div>

        <NodeCreditsFooter totalCredits={totalCredits} hasOutput={Boolean(plan)} />

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
  );
}
