"use client";

import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from "@/components/ui/context-menu";
import {
  Scissors, Copy, Clipboard, CopyPlus, Trash2, Lock, Unlock,
  BringToFront, SendToBack, ChevronUp, ChevronDown, Group as GroupIcon, Ungroup,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
} from "lucide-react";
import type { AlignMode } from "@/lib/post/align";

type Props = {
  children: React.ReactNode;
  hasSelection: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canPaste: boolean;
  isLocked: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onReorder: (direction: "front" | "forward" | "backward" | "back") => void;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (mode: AlignMode) => void;
};

// Follows node-context-menu.tsx's exact structural pattern (ContextMenu -> ContextMenuTrigger ->
// ContextMenuContent). `children` is expected to be the Konva stage's DOM container (or a wrapper
// around the <Stage>) — react-konva mounts Konva's canvas inside a real HTMLDivElement
// (see post-stage.tsx's `node.container()`), so Base UI's ContextMenuTrigger can wrap it directly
// and use its native browser `contextmenu` handling to open this menu at the cursor position, the
// same uncontrolled way NodeContextMenu wraps a node card. No controlled open/onOpenChange/position
// props are needed here; per-layer selection (which layer was right-clicked) is Task 15's concern
// when it wires this component into post-focus-view.tsx/post-stage.tsx.
export function PostLayerContextMenu({
  children, hasSelection, canGroup, canUngroup, canPaste, isLocked,
  onCut, onCopy, onPaste, onDuplicate, onDelete, onToggleLock, onReorder, onGroup, onUngroup, onAlign,
}: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={!hasSelection} onClick={onCut}>
          <Scissors className="mr-2 size-3.5" strokeWidth={1.5} /> Cut
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={onCopy}>
          <Copy className="mr-2 size-3.5" strokeWidth={1.5} /> Copy
        </ContextMenuItem>
        <ContextMenuItem disabled={!canPaste} onClick={onPaste}>
          <Clipboard className="mr-2 size-3.5" strokeWidth={1.5} /> Paste
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={onDuplicate}>
          <CopyPlus className="mr-2 size-3.5" strokeWidth={1.5} /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!hasSelection} onClick={onToggleLock}>
          {isLocked
            ? <Unlock className="mr-2 size-3.5" strokeWidth={1.5} />
            : <Lock className="mr-2 size-3.5" strokeWidth={1.5} />}
          {isLocked ? "Unlock" : "Lock"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!hasSelection} onClick={() => onReorder("front")}>
          <BringToFront className="mr-2 size-3.5" strokeWidth={1.5} /> Bring to front
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={() => onReorder("forward")}>
          <ChevronUp className="mr-2 size-3.5" strokeWidth={1.5} /> Bring forward
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={() => onReorder("backward")}>
          <ChevronDown className="mr-2 size-3.5" strokeWidth={1.5} /> Send backward
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onClick={() => onReorder("back")}>
          <SendToBack className="mr-2 size-3.5" strokeWidth={1.5} /> Send to back
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canGroup} onClick={onGroup}>
          <GroupIcon className="mr-2 size-3.5" strokeWidth={1.5} /> Group
        </ContextMenuItem>
        <ContextMenuItem disabled={!canUngroup} onClick={onUngroup}>
          <Ungroup className="mr-2 size-3.5" strokeWidth={1.5} /> Ungroup
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className={!hasSelection ? "pointer-events-none opacity-50" : undefined}>
            Align
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onAlign("left")}>
              <AlignStartVertical className="mr-2 size-3.5" strokeWidth={1.5} /> Left
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAlign("center-h")}>
              <AlignCenterVertical className="mr-2 size-3.5" strokeWidth={1.5} /> Center horizontal
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAlign("right")}>
              <AlignEndVertical className="mr-2 size-3.5" strokeWidth={1.5} /> Right
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onAlign("top")}>
              <AlignStartHorizontal className="mr-2 size-3.5" strokeWidth={1.5} /> Top
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAlign("center-v")}>
              <AlignCenterHorizontal className="mr-2 size-3.5" strokeWidth={1.5} /> Center vertical
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAlign("bottom")}>
              <AlignEndHorizontal className="mr-2 size-3.5" strokeWidth={1.5} /> Bottom
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={!hasSelection} onClick={onDelete}>
          <Trash2 className="mr-2 size-3.5" strokeWidth={1.5} /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
