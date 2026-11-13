"use client";

import type { ReactElement } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { splitPieceInDoc } from "@/lib/editor/captions";
import { duplicatePiece } from "@/lib/editor/pieces";
import { pieceLimit } from "@/lib/editor/reconcile";
import { pieceOffsets } from "@/lib/editor/timeline";
import type { EditDoc, Piece, SourceView } from "@/lib/editor/types";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { useEditorUi } from "./editor-ui-context";
import { useEditorTasks, type TaskRow } from "./use-editor-tasks";

const Key = ({ children }: { children: string }) => <span className="ml-auto pl-6 text-xs text-muted-foreground">{children}</span>;

/** What a clip's menu offers (task-menu design): its Captions / Dub / Lip sync, each with where it
 *  stands and opening in the Inspector, then the timeline edits. The same list on right-click and ⋯. */
function useClipMenu(piece: Piece, source: SourceView | undefined) {
  const store = useEditorStoreApi();
  const editable = useEditorStore((s) => s.editable);
  const pieces = useEditorStore((s) => s.doc.pieces);
  const { time } = usePlayback();
  const ui = useEditorUi();
  const tasks = useEditorTasks(piece);
  const apply = (fn: (d: EditDoc) => EditDoc) => store.getState().apply(fn);

  const index = pieces.findIndex((p) => p.id === piece.id);
  const local = time - (pieceOffsets(pieces)[index] ?? 0);
  return {
    title: `${index + 1}. ${source?.handle ?? "Missing clip"}`,
    tasks,
    editable,
    canSplit: local > 0.05 && local < piece.out - piece.in - 0.05,
    selectIt: () => store.getState().select({ kind: "piece", id: piece.id }),
    open: (t: TaskRow) => ui.openTask(t.task, piece.id),
    split: () => {
      const limit = source && pieceLimit(piece, source);
      if (limit) apply((d) => splitPieceInDoc(d, piece.id, piece.in + local, crypto.randomUUID(), limit.fps) ?? d);
    },
    duplicate: () => apply((d) => duplicatePiece(d, piece.id, crypto.randomUUID())),
    askDelete: () => ui.askDeletePiece(piece.id),
  };
}

const TaskText = ({ t }: { t: TaskRow }) => (
  <span className="flex min-w-0 flex-col gap-0.5">
    <span className="font-medium">{t.label}</span>
    <span className="truncate text-xs text-muted-foreground">{t.meta}</span>
  </span>
);

/** Right-click on a clip (D405). */
export function EditorClipMenu({ piece, source, children }: { piece: Piece; source: SourceView | undefined; children: ReactElement }) {
  const m = useClipMenu(piece, source);
  return (
    <ContextMenu onOpenChange={(open) => open && m.selectIt()}>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-60">
        <ContextMenuGroup>
          <ContextMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-[13px] font-semibold text-foreground">{m.title}</span>
            <span className="font-normal">This clip only</span>
          </ContextMenuLabel>
          {m.tasks.map((t) => (
            <ContextMenuItem key={t.task} disabled={t.disabled} onClick={() => m.open(t)} className="items-start py-1.5">
              <TaskText t={t} />
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!m.editable || !m.canSplit} onClick={m.split}>
          Split at playhead <Key>S</Key>
        </ContextMenuItem>
        <ContextMenuItem disabled={!m.editable} onClick={m.duplicate}>
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={!m.editable} onClick={m.askDelete}>
          Delete clip…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The same menu from a ⋯ button on the selected clip, for when right-click isn't found. */
export function EditorClipMoreButton({ piece, source }: { piece: Piece; source: SourceView | undefined }) {
  const m = useClipMenu(piece, source);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon-xs"
            aria-label={`Actions for clip ${m.title}`}
            title="Captions, Dub and Lip sync"
            // The clip under it starts a drag on pointer down; this button must not.
            onPointerDown={(e) => e.stopPropagation()}
            className="bg-card/95 shadow-sm"
          >
            <MoreHorizontal className="size-3.5" strokeWidth={1.5} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60 min-w-0">
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel className="flex flex-col gap-0.5 text-xs normal-case tracking-normal">
            <span className="truncate text-[13px] font-semibold text-foreground">{m.title}</span>
            <span className="font-normal">This clip only</span>
          </DropdownMenuGroupLabel>
          {m.tasks.map((t) => (
            <DropdownMenuItem key={t.task} disabled={t.disabled} onClick={() => m.open(t)} className="items-start py-1.5">
              <TaskText t={t} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!m.editable || !m.canSplit} onClick={m.split}>
          Split at playhead <Key>S</Key>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!m.editable} onClick={m.duplicate}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!m.editable} onClick={m.askDelete} className="text-destructive data-highlighted:bg-destructive/10">
          Delete clip…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
