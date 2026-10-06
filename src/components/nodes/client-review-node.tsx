"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type NodeProps } from "@xyflow/react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { clientReviewKeys, useNodeClientReview } from "@/hooks/queries/client-reviews";
import type { ClientReviewNodeData } from "@/lib/canvas-nodes";
import type { NodeClientReview } from "@/lib/client-review/wire";
import { ClientReviewFocusView } from "./client-review-focus-view";
import { ClientReviewUpload } from "./client-review-upload";
import { NodeCardHeader } from "./node-card-header";
import { NodeContextMenu } from "./node-context-menu";

// D307: terminal node (no handles) — the cut a client reviews by public link.
export function ClientReviewNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const d = data as ClientReviewNodeData;
  const [focusOpen, setFocusOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: current, isPending: loading, isError, refetch } = useNodeClientReview(id);
  const error = isError ? "Couldn't load the review." : null;
  // Stable (refetch is), so the focus view's refetch-on-open effect runs once per open.
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  // The finalize result is the node's new truth — card and focus view both read this key.
  const handleUploaded = (next: NodeClientReview) =>
    queryClient.setQueryData(clientReviewKeys.node(id), next);
  const editable = useCanvasEditable();

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
    if (!next) void reload(); // count refresh on close
  };
  useFocusViewRegistration(id, focusViewOpen);

  const count = current?.comments.length ?? 0;
  const cut = current?.review ?? null;

  return (
    <>
      <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            setFocusOpen(true);
          }}
          className={cn(
            "group w-56 rounded-lg border border-border bg-card shadow-card",
            "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        >
          <NodeCardHeader
            icon={MessageSquareText}
            nodeId={id}
            nodeType="client-review"
            title={d.title ?? ""}
            placeholder="Untitled cut"
            onCommitTitle={(t) => updateNodeData(id, { title: t })}
          />
          {cut && (
            <div className="overflow-hidden border-b border-border bg-black">
              <video
                src={`${cut.videoUrl}#t=0.1`}
                preload="metadata"
                muted
                playsInline
                className="h-32 w-full object-contain"
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            {cut ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {count} {count === 1 ? "comment" : "comments"}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => setFocusOpen(true)}
                  className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                >
                  Open ↗
                </Button>
              </>
            ) : loading ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : !current ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {error ?? "Couldn't load."}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => void reload()}
                  className="nodrag -mx-1.5 h-auto rounded-md px-1.5 py-1 text-xs"
                >
                  Retry
                </Button>
              </>
            ) : editable ? (
              <ClientReviewUpload nodeId={id} onUploaded={handleUploaded} />
            ) : (
              <span className="text-xs text-muted-foreground">No cut uploaded yet.</span>
            )}
          </div>
        </div>
      </NodeContextMenu>

      {/* Outside NodeContextMenu — same reason as draw-node.tsx: the portaled sheet's
          events would otherwise bubble into the node card. */}
      <ClientReviewFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        title={d.title ?? ""}
        data={current ?? null}
        loading={loading}
        error={error}
        onTitle={(t) => updateNodeData(id, { title: t })}
        onReload={reload}
        onUploaded={handleUploaded}
      />
    </>
  );
}
