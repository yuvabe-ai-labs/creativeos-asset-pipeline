"use client";

import type { ReactElement } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { deletePiece, splitPieceInDoc } from "@/lib/editor/captions";
import { duplicatePiece, setPicture } from "@/lib/editor/pieces";
import { pieceLimit } from "@/lib/editor/reconcile";
import { pieceOffsets } from "@/lib/editor/timeline";
import type { EditDoc, Piece, SourceView } from "@/lib/editor/types";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { useEditorUi } from "./editor-ui-context";

const Key = ({ children }: { children: string }) => <span className="ml-auto pl-6 text-xs text-muted-foreground">{children}</span>;

/** Everything you can do to a clip, on right-click (D405), as in desktop editors. */
export function EditorClipMenu({ piece, source, children }: { piece: Piece; source: SourceView | undefined; children: ReactElement }) {
  const store = useEditorStoreApi();
  const editable = useEditorStore((s) => s.editable);
  const { time } = usePlayback();
  const ui = useEditorUi();
  const captions = useAutoCaptionsContext();
  const pieces = useEditorStore((s) => s.doc.pieces);
  const sources = useEditorStore((s) => s.sources);
  const apply = (fn: (d: EditDoc) => EditDoc) => store.getState().apply(fn);

  const index = pieces.findIndex((p) => p.id === piece.id);
  const offset = pieceOffsets(pieces)[index] ?? 0;
  const local = time - offset;
  const canSplit = local > 0.05 && local < piece.out - piece.in - 0.05;
  const hasDub = Boolean(source?.files.dubAudio);
  const hasLip = Boolean(source?.files.lipSynced);

  return (
    <ContextMenu onOpenChange={(open) => open && store.getState().select({ kind: "piece", id: piece.id })}>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="min-w-60">
        <ContextMenuItem
          disabled={!editable || !canSplit}
          onClick={() => {
            const limit = source && pieceLimit(piece, source);
            if (limit) apply((d) => splitPieceInDoc(d, piece.id, piece.in + local, crypto.randomUUID(), limit.fps) ?? d);
          }}
        >
          Split at playhead <Key>S</Key>
        </ContextMenuItem>
        <ContextMenuItem disabled={!editable} onClick={() => apply((d) => duplicatePiece(d, piece.id, crypto.randomUUID()))}>
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!source} onClick={() => ui.openInspector("dub")}>
          {hasDub ? "Dub again…" : "Dub this clip…"}
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasDub} onClick={() => ui.openInspector("dub")}>
          {hasLip ? "Lip sync again…" : "Lip sync…"}
        </ContextMenuItem>
        <ContextMenuItem disabled={!editable || !hasDub} onClick={() => captions.switchSound(piece.id, piece.sound === "dubbed" ? "original" : "dubbed")}>
          {piece.sound === "dubbed" ? "Play the original sound" : "Play the dub"}
        </ContextMenuItem>
        <ContextMenuItem disabled={!editable || !hasLip} onClick={() => apply((d) => setPicture(d, piece.id, piece.picture === "lipSynced" ? "original" : "lipSynced", sources))}>
          {piece.picture === "lipSynced" ? "Show the original picture" : "Show the lip-synced picture"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!editable} onClick={() => captions.start([piece.id])}>
          Redo captions for this clip
        </ContextMenuItem>
        <ContextMenuItem onClick={ui.goToCanvas}>Back to the canvas</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" disabled={!editable} onClick={() => apply((d) => deletePiece(d, piece.id))}>
          Delete <Key>Del</Key>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
