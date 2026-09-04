"use client";

import { useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ListVideo } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useGalleryDrawer } from "@/components/canvas/gallery-drawer-context";
import { useGalleryNodeDrop } from "@/hooks/use-gallery-node-drop";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { NodeCreditsFooter } from "./node-credits-footer";
import { useNodeCost } from "@/hooks/use-node-cost";
import { MultishotPromptFocusView } from "./multishot-prompt-focus-view";
import { DEFAULT_IMAGE_PROMPT_SLICES } from "@/lib/kb/parse-context";
import type { MultishotNodeData, MultishotPromptNodeData } from "@/lib/canvas-nodes";
import type { MultishotPlan } from "@/lib/nodes/multishot-plan";

const TYPE_LABEL: Record<string, string> = {
  script: "Script", text: "Note", prompt: "Prompt", kb: "Brand KB",
  file: "File", shot: "Shot", draw: "Sketch", "image-gen": "Image", multishot: "Multishot",
};

// Multishot Prompt node (D231). Sibling of the Video Prompt node's compact launcher (same
// NodeCardHeader/NodeContextMenu/handle structure), but its body summarises a structured
// MultishotPlan instead of a single prompt string: how many beats the writer produced, the
// budget it wrote against (read from the upstream Multishot node — this node has no budget of
// its own), and the look block's opening line once a plan exists.
//
// Its focus view (Task 15, §8 of docs/superpowers/specs/2026-09-02-multishot-node-types-design.md)
// is the three-column breakup view: Connected / Input / Output.
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
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);

  // The upstream Multishot node (D230) — the sole source of the budget AND the cut list. This
  // node only ever writes against it, never sets it: the focus view's beat timecodes and the
  // Input column's per-cut cards both read `cuts` from here, computed once, rather than each
  // re-deriving its own upstream walk.
  const multishotSource = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    return nodes.find((n) => sourceIds.includes(n.id) && n.type === "multishot");
  }, [nodes, edges, id]);
  const budget = (multishotSource?.data as MultishotNodeData | undefined)?.totalSeconds;
  const cuts = (multishotSource?.data as MultishotNodeData | undefined)?.cuts ?? [];

  // Every connected upstream, mapped the same way VideoPromptNode does — an Image Gen still's
  // URL lives in its active output (D19), File/Draw carry their own fileUrl directly. This is
  // the shared reference library every chip editor on the focus view mentions from.
  const upstream = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const directNodes = nodes.filter((n) => sourceIds.includes(n.id));
    return directNodes.map((n) => {
      const nd = n.data as Record<string, unknown>;
      const fileUrl =
        n.type === "file" || n.type === "draw"
          ? (nd.fileUrl as string | undefined)
          : n.type === "image-gen"
            ? (typeof nd.parsed === "string" ? (nd.parsed as string) : undefined)
            : undefined;
      const fileKind =
        n.type === "file" || n.type === "draw"
          ? (nd.fileKind as string | undefined)
          : n.type === "image-gen"
            ? "image"
            : undefined;
      const typeLabel = TYPE_LABEL[n.type ?? ""] ?? String(n.type);
      return {
        id: n.id,
        label: (nd.title as string | undefined)?.trim() || typeLabel,
        type: n.type ?? "",
        fileUrl,
        fileKind,
        useLlm: n.type === "file" ? (nd.useLlm as boolean | undefined) : undefined,
      };
    });
  }, [nodes, edges, id]);

  const d = data as MultishotPromptNodeData;
  const title = d.title ?? "";
  const plan = (d.parsed ?? null) as MultishotPlan | null;
  const status = plan ? `${plan.beats.length} beats` : "Not written yet";
  const lookFirstLine = plan?.look.split("\n")[0]?.trim();
  const totalCredits = useNodeCost(id);
  const slices = d.kbSlices ?? DEFAULT_IMAGE_PROMPT_SLICES;
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
          <Button
            variant="ghost"
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 mt-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
          >
            Open ↗
          </Button>
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

    {/* Outside NodeContextMenu: the portaled sheet still sits in the node's React tree, so as
        a child its contextmenu/dblclick/drop events bubbled into the node card. */}
    <MultishotPromptFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      nodeId={id}
      title={title}
      instruction={d.instruction ?? ""}
      cutInstructions={d.cutInstructions ?? {}}
      plan={plan}
      slices={slices}
      cuts={cuts}
      multishotNodeId={multishotSource?.id ?? null}
      upstream={upstream}
      onPatch={(patch) => updateNodeData(id, patch)}
    />
    </>
  );
}
