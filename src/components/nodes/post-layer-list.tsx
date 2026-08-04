// src/components/nodes/post-layer-list.tsx
"use client";

import { Copy, Eye, EyeOff, Lock, Trash2, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PostLayer } from "@/lib/post/types";
import type { ReorderDirection } from "@/lib/post/layers";

type Props = {
  layers: PostLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: ReorderDirection) => void;
  onToggleLock: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

function layerLabel(layer: PostLayer): string {
  if (layer.name) return layer.name;
  if (layer.kind === "text") return layer.text.slice(0, 24) || "Text";
  return layer.kind.charAt(0).toUpperCase() + layer.kind.slice(1);
}

// Rendered FRONT-first (reverse of the back-to-front layer array) so the topmost,
// most-likely-to-be-clicked layer sits at the top of the list — matching how a
// layers panel reads in every design tool.
export function PostLayerList({
  layers, selectedId, onSelect, onReorder, onToggleLock, onToggleHidden, onDuplicate, onDelete,
}: Props) {
  const frontFirst = [...layers].reverse();

  if (layers.length === 0) {
    return <p className="text-sm text-muted-foreground">No layers yet — use Add to start.</p>;
  }

  return (
    <ul className="space-y-1">
      {frontFirst.map((layer) => (
        <li
          key={layer.id}
          onClick={() => onSelect(layer.id)}
          className={cn(
            "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs cursor-pointer",
            selectedId === layer.id ? "bg-primary/10 text-primary" : "hover:bg-muted",
            layer.hidden && "opacity-50",
          )}
        >
          <span
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: layer.kind === "shape" && layer.fill.kind === "solid" ? layer.fill.color : "#d4d4d8" }}
          />
          <span className="flex-1 truncate">{layerLabel(layer)}</span>
          <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
            <Button
              variant="ghost" size="icon" className="size-5"
              onClick={(e) => { e.stopPropagation(); onToggleHidden(layer.id); }}
              aria-label={layer.hidden ? "Show layer" : "Hide layer"}
            >
              {layer.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </Button>
            <Button
              variant="ghost" size="icon" className="size-5"
              onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
              aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
            >
              {layer.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
            </Button>
            <Button
              variant="ghost" size="icon" className="size-5"
              onClick={(e) => { e.stopPropagation(); onDuplicate(layer.id); }}
              aria-label="Duplicate layer"
            >
              <Copy className="size-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className="size-5 text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}
              aria-label="Delete layer"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
          {layer.locked && <Lock className="size-3 shrink-0 text-muted-foreground group-hover:hidden" />}
        </li>
      ))}
    </ul>
  );
}
