"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { saveScriptOutputAction } from "@/lib/actions/nodes";
import { ScriptFocusView } from "./script-focus-view";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { ProcessingPill } from "./processing-pill";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { DEFAULT_PARSE_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";
import { useNodeConnectionState } from "./use-node-connection-state";

export function ScriptNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const fanOutShots = useCanvasStore((s) => s.fanOutShots);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const d = data as {
    title?: string;
    source?: string;
    parsed?: unknown;
    kbSlices?: KBSliceKey[];
    groupModes?: Record<string, boolean>;
  };
  const parsed = (d.parsed ?? null) as ReelScript | null;
  const title = d.title || parsed?.title || "";
  const source = d.source ?? "";
  const slices = d.kbSlices ?? DEFAULT_PARSE_SLICES;
  const groupModes = d.groupModes;
  const [focusOpen, setFocusOpen] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const connState = useNodeConnectionState(id, "script");

  // Open locally (double-click / "Open ↗") OR when the shared signal points here —
  // the Generation Tray, guided flow, or the copilot's open_node (setFocusedNodeId).
  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null); // consume the signal
  };
  useFocusViewRegistration(id, focusViewOpen);

  return (
    <>
    <NodeContextMenu
      onDuplicate={() => duplicateNode(id)}
      onDelete={() => deleteNode(id)}
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
      <NodeCardHeader
        icon={FileText}
        nodeId={id}
        nodeType="script"
        title={title}
        placeholder="Untitled script"
        onCommitTitle={(t) => updateNodeData(id, { title: t })}
        status={
          isParsing ? (
            <ProcessingPill processing />
          ) : (
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors",
                parsed ? "bg-primary" : "bg-muted-foreground/40",
              )}
              title={parsed ? "Extracted" : "Not extracted"}
            />
          )
        }
      />

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
          <Button
            variant="ghost"
            onClick={() => setFocusOpen(true)}
            className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10 hover:text-primary"
          >
            Open ↗
          </Button>
        </div>
      )}

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
    <ScriptFocusView
      open={focusViewOpen}
      onOpenChange={handleFocusOpenChange}
      nodeId={id}
      title={title}
      source={source}
      parsed={parsed}
      groupModes={groupModes}
      slices={slices}
      onPatch={(patch) => updateNodeData(id, patch)}
      onParsingChange={setIsParsing}
      onSaveOutput={(output) => saveScriptOutputAction(id, output)}
      onFanOut={() => {
        const n = parsed?.visual_script?.shots?.length ?? 0;
        fanOutShots(id);
        handleFocusOpenChange(false);
        toast.success(`Fanned out ${n} shot${n === 1 ? "" : "s"}`);
      }}
    />
    </>
  );
}
