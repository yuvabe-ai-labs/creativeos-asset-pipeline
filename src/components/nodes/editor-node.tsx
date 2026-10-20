"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasId } from "@/components/canvas/canvas-id-context";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useLockHandoffNavigation } from "@/hooks/use-lock-handoff-navigation";
import { editorKeys, useEditorState } from "@/hooks/queries/editor";
import { editorSourceCount } from "@/lib/editor/generation-lock";
import { editSummary } from "@/lib/editor/summary";
import { formatTime } from "@/lib/editor/timeline";
import type { EditorNodeData } from "@/lib/canvas-nodes";
import { NodeContextMenu } from "./node-context-menu";
import { NodeCardHeader } from "./node-card-header";
import { EditorNodeStrip } from "./editor-node-strip";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const EMPTY = "Connect Video Gen or Dubbing nodes.";

// D387 — the Rough Cut Editor's card, laid out from the canvas mockup
// (https://claude.ai/artifact/SseUKVaihCKMsHZscoQDCR, "Main"). It edits nothing: it summarises the
// reel and opens the editor page. One Editor per canvas, so its one state query is one request per
// canvas, not per node (performance rule 1), and its selectors read no store collection.
export function EditorNode({ id, data, selected }: NodeProps) {
  const d = data as EditorNodeData;
  const canvasId = useCanvasId();
  const pathname = usePathname();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focused = useCanvasStore((s) => s.focusedNodeId === id);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const deleteNode = useDeleteNode();
  const flushAutosave = useFlushAutosave();
  const navigate = useLockHandoffNavigation(canvasId);
  const { data: state, isPending } = useEditorState(canvasId);

  // Connecting or disconnecting a source changes what the card summarises. The lock index already
  // counts the Editor's inputs (O(1) to read: the selector returns the stored object). Refresh once
  // the canvas has saved the new edge, so the server reads it.
  const locks = useCanvasStore((s) => s.generationLocks);
  const sourceCount = useMemo(() => editorSourceCount(locks), [locks]);
  const queryClient = useQueryClient();
  const seenCount = useRef(sourceCount);
  useEffect(() => {
    if (seenCount.current === sourceCount) return;
    seenCount.current = sourceCount;
    void flushAutosave().then(() => queryClient.invalidateQueries({ queryKey: editorKeys.state(canvasId) }));
  }, [sourceCount, flushAutosave, queryClient, canvasId]);

  const open = useCallback(() => {
    void navigate(`${pathname}/edit`, flushAutosave);
  }, [navigate, pathname, flushAutosave]);

  // The shared "open this node" signal (generation tray, copilot open_node) opens the editor page,
  // since this node has no focus view. Consume it so it doesn't re-fire.
  useEffect(() => {
    if (!focused) return;
    setFocusedNodeId(null);
    open();
  }, [focused, open, setFocusedNodeId]);

  const summary = state && state.editorNodeId === id ? editSummary(state) : null;
  const line = sourceCount === 0
    ? EMPTY
    : summary
    ? summary.sources === 0
      ? EMPTY
      : `${plural(summary.sources, "source")} · ${plural(summary.pieces, "piece")} · ${formatTime(summary.seconds)} · ${summary.shape}`
    : isPending
      ? "Reading the clips…"
      : EMPTY;

  return (
    <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          open();
        }}
        className={cn(
          "w-[360px] rounded-xl border border-border bg-card shadow-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
          selected && "border-primary",
        )}
      >
        <NodeCardHeader icon={Scissors} nodeId={id} nodeType="editor" title={d.title ?? ""} placeholder="Rough cut" onCommitTitle={(t) => updateNodeData(id, { title: t })} />
        <div className="flex flex-col gap-3.5 px-4 pb-4 pt-1">
          <p className="text-sm text-muted-foreground tabular-nums">{line}</p>
          {summary && <EditorNodeStrip summary={summary} />}
          {summary && (summary.captions > 0 || summary.dubbedPieces > 0) && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {summary.captions > 0 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-foreground/80">{plural(summary.captions, "caption")}</span>}
              {summary.dubbedPieces > 0 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-foreground/80">{plural(summary.dubbedPieces, "dubbed piece")}</span>}
            </div>
          )}
          <Button onClick={open} className="nodrag h-10 w-full font-semibold">
            Open editor
          </Button>
        </div>
        <Handle type="target" position={Position.Left} className="!size-4 !border-2 !border-card !bg-muted-foreground" />
      </div>
    </NodeContextMenu>
  );
}
