"use client";

import { useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useCanvasId } from "@/components/canvas/canvas-id-context";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { saveScriptOutputAction } from "@/lib/actions/nodes";
import { ScriptFocusView } from "./script-focus-view";
import { NodeContextMenu } from "./node-context-menu";
import { NodeTitle } from "./node-title";
import { ProcessingPill } from "./processing-pill";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { DEFAULT_PARSE_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";
import { useNodeConnectionState } from "./use-node-connection-state";

export function ScriptNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const fanOutShots = useCanvasStore((s) => s.fanOutShots);
  const canvasId = useCanvasId();
  const allNodes = useCanvasStore((s) => s.nodes);
  const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
  const { deleteElements } = useReactFlow();

  const selectedNonKbNodes = allNodes.filter((n) => n.selected && n.type !== "kb");
  const selectedCount = selectedNonKbNodes.length;
  const selectedIds = selectedNonKbNodes.map((n) => n.id);
  const d = data as {
    title?: string;
    source?: string;
    parsed?: unknown;
    kbSlices?: KBSliceKey[];
  };
  const parsed = (d.parsed ?? null) as ReelScript | null;
  const title = d.title || parsed?.title || "";
  const source = d.source ?? "";
  const slices = d.kbSlices ?? DEFAULT_PARSE_SLICES;
  const [focusOpen, setFocusOpen] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const connState = useNodeConnectionState(id, "script");

  return (
    <NodeContextMenu
      selectedCount={selectedCount}
      onDuplicate={() =>
        selectedCount > 1
          ? void duplicateNodes(selectedIds, canvasId)
          : void duplicateNode(id)
      }
      onDelete={() =>
        selectedCount > 1
          ? void deleteElements({ nodes: selectedIds.map((sid) => ({ id: sid })) })
          : deleteNode(id)
      }
    >
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        setFocusOpen(true);
      }}
      className={cn(
        "group w-44 rounded-lg border border-border bg-card shadow-card",
        "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        connState === "invalid" && "opacity-60 pointer-events-none",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3.5 text-primary" />
          <span className="text-eyebrow !text-[0.65rem]">Script</span>
        </div>
        {isParsing ? (
          <ProcessingPill processing />
        ) : (
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              parsed ? "bg-primary" : "bg-muted-foreground/40",
            )}
            title={parsed ? "Extracted" : "Not extracted"}
          />
        )}
      </div>

      {isParsing ? (
        <div className="space-y-2 px-3 py-3">
          <div className="h-2.5 w-3/5 animate-pulse rounded-md bg-muted" />
          <div className="space-y-1.5 pt-0.5">
            <div className="h-1.5 w-full animate-pulse rounded bg-muted/80" />
            <div className="h-1.5 w-4/5 animate-pulse rounded bg-muted/80" />
            <div className="h-1.5 w-11/12 animate-pulse rounded bg-muted/80" />
          </div>
        </div>
      ) : (
        <div className="px-3 py-3">
          <NodeTitle
            value={title}
            placeholder="Untitled script"
            onCommit={(t) => updateNodeData(id, { title: t })}
          />
          <button
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Open ↗
          </button>
        </div>
      )}

      <ScriptFocusView
        open={focusOpen}
        onOpenChange={setFocusOpen}
        nodeId={id}
        title={title}
        source={source}
        parsed={parsed}
        slices={slices}
        onPatch={(patch) => updateNodeData(id, patch)}
        onParsingChange={setIsParsing}
        onSaveOutput={(output) => saveScriptOutputAction(id, output)}
        onFanOut={() => {
          const n = parsed?.visual_script?.shots?.length ?? 0;
          fanOutShots(id);
          setFocusOpen(false);
          toast.success(`Fanned out ${n} shot${n === 1 ? "" : "s"}`);
        }}
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
  );
}
