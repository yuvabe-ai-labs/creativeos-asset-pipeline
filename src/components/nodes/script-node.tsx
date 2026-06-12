"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { saveScriptOutputAction } from "@/lib/actions/nodes";
import { ScriptFocusView } from "./script-focus-view";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { DEFAULT_PARSE_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";

// Script node. A compact launcher on the canvas; clicking Open hands off to the
// full-screen Script focus view, which owns the whole lifecycle (upload → parse
// → review/edit). The node itself just shows the title + extraction status.
export function ScriptNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const fanOutShots = useCanvasStore((s) => s.fanOutShots);
  const d = data as {
    title?: string;
    source?: string;
    parsed?: unknown;
    kbSlices?: KBSliceKey[];
  };
  const title = d.title ?? "";
  const source = d.source ?? "";
  const parsed = (d.parsed ?? null) as ReelScript | null;
  const slices = d.kbSlices ?? DEFAULT_PARSE_SLICES;
  const [focusOpen, setFocusOpen] = useState(false);

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        setFocusOpen(true);
      }}
      className={cn(
        "w-44 rounded-lg border border-border bg-card shadow-card",
        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3.5 text-primary" />
          <span className="text-eyebrow !text-[0.65rem]">Script</span>
        </div>
        <span
          className={cn(
            "size-1.5 rounded-full",
            parsed ? "bg-primary" : "bg-muted-foreground/40",
          )}
          title={parsed ? "Extracted" : "Not extracted"}
        />
      </div>

      <div className="px-3 py-3">
        <p className="truncate font-display text-sm font-medium">
          {title || <span className="text-muted-foreground">Untitled script</span>}
        </p>
        <button
          onClick={() => setFocusOpen(true)}
          className="nodrag -mx-1.5 mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Open ↗
        </button>
      </div>

      <ScriptFocusView
        open={focusOpen}
        onOpenChange={setFocusOpen}
        nodeId={id}
        title={title}
        source={source}
        parsed={parsed}
        slices={slices}
        onPatch={(patch) => updateNodeData(id, patch)}
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
        className="!size-2 !border-2 !border-card !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
