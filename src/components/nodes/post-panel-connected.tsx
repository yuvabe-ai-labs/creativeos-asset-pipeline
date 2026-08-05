"use client";

import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  nodes: { nodeId: string; url: string; title?: string }[];
  onAdd: (nodeId: string) => void;
};

/** The drag payload key the stage's drop handler reads (Task 25). */
export const CONNECTED_DRAG_TYPE = "application/x-post-node-id";

export function PostPanelConnected({ nodes, onAdd }: Props) {
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
        <ImageOff className="size-6 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="text-xs text-muted-foreground">
          Nothing connected yet. Wire an Image or File node into this Post node to use its picture
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.6rem] text-muted-foreground">Click to add, or drag onto the canvas.</p>
      <div className="grid grid-cols-2 gap-2">
        {nodes.map((n) => (
          <Button
            key={n.nodeId}
            variant="outline"
            onClick={() => onAdd(n.nodeId)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(CONNECTED_DRAG_TYPE, n.nodeId);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="h-auto flex-col gap-1 p-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={n.url}
              alt={n.title ?? "Connected image"}
              className="aspect-square w-full rounded-sm object-cover"
            />
            <span className="block w-full truncate text-[0.6rem] text-muted-foreground">
              {n.title ?? "Untitled"}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
