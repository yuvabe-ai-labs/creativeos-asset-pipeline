"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Paperclip, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { FileNodeData } from "@/lib/canvas-nodes";
import { FileFocusView } from "./file-focus-view";
import { useNodeConnectionState } from "./use-node-connection-state";
import { NodeContextMenu } from "./node-context-menu";

const KIND_LABELS = { text: "TXT", image: "IMG", document: "DOC" } as const;

export function FileNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const d = data as FileNodeData;
  const [focusOpen, setFocusOpen] = useState(false);
  const connState = useNodeConnectionState(id, "file");

  const hasFile = !!d.filename;

  return (
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
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Paperclip className="size-3.5 text-primary" />
          <span className="text-eyebrow text-[0.65rem]!">File</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "size-1.5 rounded-full",
              hasFile ? "bg-primary" : "bg-muted-foreground/40",
            )}
            title={hasFile ? "File attached" : "No file"}
          />
          {d.useLlm && <Sparkles className="size-2.5 text-primary" />}
        </div>
      </div>

      {/* image thumbnail */}
      {d.fileKind === "image" && d.fileUrl && (
        <div className="overflow-hidden border-b border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={d.fileUrl}
            alt={d.filename ?? "image"}
            className="h-16 w-full object-cover"
          />
        </div>
      )}

      <div className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate font-display text-sm font-medium">
            {d.title || <span className="text-muted-foreground">Untitled file</span>}
          </p>
          {hasFile && d.fileKind && (
            <span className="shrink-0 rounded px-1 py-0.5 text-[0.6rem] font-medium leading-none bg-muted text-muted-foreground">
              {KIND_LABELS[d.fileKind]}
            </span>
          )}
        </div>
        {hasFile && d.filename && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {d.filename}
          </p>
        )}
        <button
          onClick={() => setFocusOpen(true)}
          className="nodrag -mx-1.5 mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Open ↗
        </button>
      </div>

      <FileFocusView
        open={focusOpen}
        onOpenChange={setFocusOpen}
        nodeId={id}
        title={d.title ?? ""}
        filename={d.filename}
        fileExt={d.fileExt}
        fileKind={d.fileKind}
        fileUrl={d.fileUrl}
        rawText={d.rawText}
        useLlm={d.useLlm}
        llmPrompt={d.llmPrompt}
        processedOutput={d.processedOutput}
        onPatch={(patch) => updateNodeData(id, patch)}
      />

      <Handle
        type="source"
        position={Position.Right}
        className="size-2! border-2! border-card! bg-primary!"
      />
    </div>
    </NodeContextMenu>
  );
}
