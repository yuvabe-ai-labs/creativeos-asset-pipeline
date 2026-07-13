"use client";

import { useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasId } from "@/components/canvas/canvas-id-context";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useReferenceImagePicker } from "@/hooks/use-reference-image-picker";
import { savePromptOutputAction } from "@/lib/actions/nodes";
import { PromptFocusView } from "./prompt-focus-view";
import { DEFAULT_IMAGE_PROMPT_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";
import type { ShotControls } from "@/lib/nodes/shot-controls";
import { NodeContextMenu } from "./node-context-menu";
import { NodeTitle } from "./node-title";
import { ApprovalBadge } from "./approval-badge";
import type { ApprovalStatus } from "@/lib/approval";
import { useNodeCost } from "@/hooks/use-node-cost";
import { ReferenceImagePickerDialog } from "@/components/canvas/reference-image-picker-dialog";

const TYPE_LABEL: Record<string, string> = { script: "Script", text: "Note", prompt: "Prompt", kb: "Brand KB", file: "File", shot: "Shot", draw: "Sketch", "image-gen": "Image" };

// Prompt node. A compact launcher; double-click / Open hands off to the Prompt
// focus view. The Inputs panel's connected-node list is derived from the store graph.
export function PromptNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const canvasId = useCanvasId();
  const { open, setOpen, openPicker, handleAdd } = useReferenceImagePicker();
  // Select the raw store slices (stable references) and DERIVE the upstream list
  // with useMemo. Returning a freshly-built array of objects straight from the
  // selector breaks useSyncExternalStore caching (useShallow only stabilizes one
  // level deep, so the inner {id,label} objects never compare equal) → the
  // "getSnapshot should be cached" infinite-loop error once the list is non-empty.
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const upstream = useMemo(() => {
    const sourceIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const directNodes = nodes.filter((n) => sourceIds.includes(n.id));

    // Each Shot already carries the full reel script narrowed to its one shot (D21);
    // we do NOT also surface the parent Script, which would pass the whole reel.
    return directNodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      const typeLabel = TYPE_LABEL[n.type ?? ""] ?? String(n.type);
      const fileUrl =
        n.type === "file" || n.type === "draw"
          ? (d.fileUrl as string | undefined)
          : n.type === "image-gen"
            ? (typeof d.parsed === "string" ? d.parsed : undefined)
            : undefined;
      return {
        id: n.id,
        label: (d.title as string | undefined)?.trim() || typeLabel,
        type: n.type ?? "",
        fileUrl,
        fileKind:
          n.type === "file" || n.type === "draw"
            ? (d.fileKind as string | undefined)
            : n.type === "image-gen"
              ? "image"
              : undefined,
        useLlm: n.type === "file" ? (d.useLlm as boolean | undefined) : undefined,
        role: n.type === "shot" ? (d.role as string | undefined) : undefined,
      };
    });
  }, [nodes, edges, id]);

  const d = data as {
    title?: string;
    instruction?: string;
    parsed?: unknown;
    kbSlices?: KBSliceKey[];
    controls?: ShotControls;
  };
  const title = d.title ?? "";
  const instruction = d.instruction ?? "";
  const output = (d.parsed ?? null) as string | null;
  // D29: active version's approval status (present once a version exists).
  const approvalStatus = (d as { approvalStatus?: ApprovalStatus }).approvalStatus;
  const slices = d.kbSlices ?? DEFAULT_IMAGE_PROMPT_SLICES;
  const controls = d.controls ?? null;
  const totalInr = useNodeCost(id);
  const kbJustReady = useCanvasStore((s) => s.kbJustReady);
  const [focusOpen, setFocusOpen] = useState(false);
  // Open locally (double-click / "Open ↗") OR when the guided flow points here (D35/D36).
  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };

  return (
    <>
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)} onAddReferenceImage={() => openPicker({ position: { x: positionAbsoluteX ?? 0, y: positionAbsoluteY ?? 0 }, connectToNodeId: id })}>
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        setFocusOpen(true);
      }}
      className={cn(
        "w-44 rounded-lg border border-border bg-card shadow-card",
        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        kbJustReady && "ring-2 ring-purple-400 ring-offset-1 transition-shadow duration-500",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-eyebrow !text-[0.65rem]">Prompt</span>
        </div>
        <span
          className={cn("size-1.5 rounded-full", output ? "bg-primary" : "bg-muted-foreground/40")}
          title={output ? "Generated" : "Not generated"}
        />
      </div>

      <div className="px-3 py-3">
        {output && approvalStatus && (
          <div className="mb-2">
            <ApprovalBadge status={approvalStatus} />
          </div>
        )}
        <NodeTitle
          value={title}
          placeholder="Image prompt"
          onCommit={(t) => updateNodeData(id, { title: t })}
        />
        <button
          onClick={() => setFocusOpen(true)}
          className="nodrag -mx-1.5 mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Open ↗
        </button>
      </div>

      {totalInr !== null && totalInr > 0 && (
        <div className="border-t border-border px-3 py-1.5">
          <p className="text-[0.6rem] tabular-nums text-muted-foreground">
            ₹{totalInr.toFixed(2)} spent
          </p>
        </div>
      )}

      <PromptFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        title={title}
        instruction={instruction}
        output={output}
        slices={slices}
        controls={controls}
        upstream={upstream}
        onPatch={(patch) => updateNodeData(id, patch)}
        onSaveOutput={(o) => savePromptOutputAction(id, o)}
      />

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
    <ReferenceImagePickerDialog
      canvasId={canvasId}
      open={open}
      onOpenChange={setOpen}
      onAdd={handleAdd}
    />
    </>
  );
}
