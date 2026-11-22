"use client";

import type { ReactElement } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
 *  stands and opening in the Inspector, then the timeline edits. Right-click only (D504). */
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
