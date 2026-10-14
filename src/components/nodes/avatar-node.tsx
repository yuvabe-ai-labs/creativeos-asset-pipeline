"use client";

import { useState } from "react";
import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ArrowUpRight, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useClientId, useClientSlug } from "@/components/canvas/client-id-context";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import { useAvatar } from "@/hooks/queries/avatars";
import { avatarVoiceLine } from "@/lib/avatars/canvas";
import type { AvatarNodeData } from "@/lib/canvas-nodes";
import { AvatarFocusView } from "./avatar-focus-view";
import { NodeCardHeader } from "./node-card-header";
import { NodeContextMenu } from "./node-context-menu";
import { useNodeConnectionState } from "./use-node-connection-state";

// D298 — an avatar on the canvas. The node holds only the avatar's id; everything shown is read
// live, so a name, face or voice changed in the Avatar Studio shows here without re-dropping. It
// is a source only: it presents a Script.
export function AvatarNode({ id, data, selected }: NodeProps) {
  const { avatarId } = data as AvatarNodeData;
  const clientId = useClientId();
  const clientSlug = useClientSlug();
  const lookup = useAvatar(clientId, avatarId);
  const avatar = lookup.avatar;
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const connState = useNodeConnectionState(id, "avatar");
  const [focusOpen, setFocusOpen] = useState(false);

  // Open on double-click, or when the shared signal points here (the Script's presenter row).
  const focusViewOpen = (focusOpen || focusedNodeId === id) && lookup.status === "ready";
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
  };
  useFocusViewRegistration(id, focusViewOpen);
  const studioHref = `/clients/${clientSlug}/avatars/${avatarId}`;

  return (
    <>
      <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            setFocusOpen(true);
          }}
          className={cn(
            "group w-44 rounded-lg border border-border bg-card shadow-card",
            "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            connState === "invalid" && "pointer-events-none opacity-60",
          )}
        >
          <NodeCardHeader
            icon={UserRound}
            nodeId={id}
            nodeType="avatar"
            title={avatar?.name ?? ""}
            placeholder={lookup.status === "gone" ? "Avatar" : "Avatar…"}
          />

          <div className="flex flex-col gap-2 px-3 pb-3">
            {lookup.status === "loading" && <Skeleton className="aspect-[3/4] w-full rounded-md" />}

            {lookup.status === "gone" && (
              <p className="rounded-md border border-dashed px-2 py-6 text-center text-xs text-muted-foreground">
                This avatar is no longer available
              </p>
            )}

            {avatar && (
              <>
                <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
                  {avatar.front ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar.front.url} alt="" className="size-full object-cover object-top" />
                  ) : (
                    <UserRound className="absolute inset-0 m-auto size-8 text-muted-foreground/40" strokeWidth={1.5} />
                  )}
                  {avatar.archivedAt && (
                    <Badge variant="outline" className="absolute inset-x-1.5 bottom-1.5 justify-center bg-card text-[0.65rem]">
                      Archived — still works here
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{avatarVoiceLine(avatar.voice)}</p>
                <div className="flex items-center justify-between gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => setFocusOpen(true)}
                    className="nodrag -mx-1.5 h-auto gap-1 rounded-md px-1.5 py-1 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                  >
                    Open ↗
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    aria-label="Open in Studio"
                    title="Open in Studio"
                    className="nodrag text-muted-foreground"
                    render={<Link href={studioHref} target="_blank" rel="noopener" />}
                  >
                    <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
                  </Button>
                </div>
              </>
            )}
          </div>

          <Handle
            type="source"
            position={Position.Right}
            className="!size-4 !border-2 !border-card !bg-primary"
          />
        </div>
      </NodeContextMenu>

      {avatar && (
        <AvatarFocusView
          open={focusViewOpen}
          onOpenChange={handleFocusOpenChange}
          avatar={avatar}
          studioHref={studioHref}
        />
      )}
    </>
  );
}
