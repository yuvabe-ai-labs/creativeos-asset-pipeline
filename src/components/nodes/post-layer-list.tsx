// src/components/nodes/post-layer-list.tsx
"use client";

import { useState, type DragEvent } from "react";
import { Copy, Eye, EyeOff, GripVertical, Lock, Trash2, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EditableField } from "./editable-field";
import type { PostLayer } from "@/lib/post/types";
import type { ReorderDirection } from "@/lib/post/layers";

type Props = {
  layers: PostLayer[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (id: string, direction: ReorderDirection) => void;
  onReorderToIndex: (id: string, targetIndex: number) => void;
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
  layers, selectedIds, onSelect, onToggleSelect, onRename, onReorder: _onReorder, onReorderToIndex,
  onToggleLock, onToggleHidden, onDuplicate, onDelete,
}: Props) {
  const frontFirst = [...layers].reverse();

  // Which row (by id) is currently swapped into rename mode — armed by a double-click on its
  // label. Only one row at a time; reverting to plain selectable text happens on blur (the
  // EditableField's Input/Textarea unmounting after commit/Escape) — see the wrapping div below.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Drag-and-drop reorder state — native HTML5 DnD, scoped to this list only (no shared
  // abstraction; this is the only drag-reorderable list in the codebase today).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  if (layers.length === 0) {
    return <p className="text-sm text-muted-foreground">No layers yet — use Add to start.</p>;
  }

  function handleSelect(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, id: string) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) onToggleSelect(id);
    else onSelect(id);
  }

  function handleDragStart(e: DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDragOver(e: DragEvent, id: string) {
    if (!dragId || dragId === id) return;
    e.preventDefault(); // required to allow a drop
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }

  function handleDrop(e: DragEvent, id: string) {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = dragId;
    setDragId(null);
    if (!sourceId || sourceId === id) return;
    // targetIndex is measured in the raw (back-to-front) `layers` order — the same space
    // reorderLayerToIndex expects — not the reversed front-first index this list renders in.
    const targetIndex = layers.findIndex((l) => l.id === id);
    if (targetIndex !== -1) onReorderToIndex(sourceId, targetIndex);
  }

  return (
    <ul className="space-y-1">
      {frontFirst.map((layer) => {
        const isSelected = selectedIds.includes(layer.id);
        const isRenaming = renamingId === layer.id;

        const rowInner = (
          <>
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: layer.kind === "shape" && layer.fill.kind === "solid" ? layer.fill.color : "#d4d4d8" }}
            />
            {isRenaming ? (
              <EditableField
                value={layer.name ?? layerLabel(layer)}
                onCommit={(name) => onRename(layer.id, name)}
                singleLine
                className="flex-1 truncate text-xs"
              />
            ) : (
              <span
                className="flex-1 truncate cursor-pointer rounded-sm underline decoration-transparent decoration-dotted decoration-2 underline-offset-4 transition-colors hover:bg-primary/5 hover:decoration-primary/50"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(layer.id);
                }}
              >
                {layerLabel(layer)}
              </span>
            )}
            {layer.locked && <Lock className="size-3 shrink-0 text-muted-foreground group-hover:hidden" />}
          </>
        );

        return (
          <li
            key={layer.id}
            draggable={!layer.locked && !isRenaming}
            onDragStart={(e) => handleDragStart(e, layer.id)}
            onDragOver={(e) => handleDragOver(e, layer.id)}
            onDragLeave={() => setDragOverId((cur) => (cur === layer.id ? null : cur))}
            onDrop={(e) => handleDrop(e, layer.id)}
            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
            className={cn(
              "group rounded-md px-2 py-1.5 text-xs",
              isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted",
              layer.hidden && "opacity-50",
              dragId === layer.id && "opacity-40",
              dragOverId === layer.id && "ring-1 ring-inset ring-primary/50",
            )}
          >
            <div className="flex items-center gap-1.5">
              <GripVertical
                aria-hidden="true"
                className="size-3 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100"
              />
              {isRenaming ? (
                // A plain div, not a button, while renaming — EditableField renders its own
                // interactive button/input, and nesting that inside another <button> (the
                // non-renaming branch below) would be invalid HTML. onClick here is a safety
                // net: clicking anywhere in this region (including through to EditableField's
                // own control) still selects the row, so a row armed for rename but not yet
                // clicked into never becomes unselectable. onBlur fires once the EditableField's
                // Input/Textarea unmounts (commit or Escape), reverting this row back to the
                // plain selectable button below.
                <div
                  role="button"
                  tabIndex={0}
                  className="flex flex-1 items-center gap-1.5 min-w-0 text-left"
                  onClick={(e) => handleSelect(e, layer.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (e.key === " ") e.preventDefault();
                      handleSelect(e, layer.id);
                    }
                  }}
                  onBlur={() => setRenamingId(null)}
                >
                  {rowInner}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => handleSelect(e, layer.id)}
                  className="flex-1 flex items-center gap-1.5 min-w-0 text-left"
                >
                  {rowInner}
                </button>
              )}
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
