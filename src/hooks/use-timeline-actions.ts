"use client";

import { useCallback } from "react";
import { useEditorStoreApi } from "@/components/editor/editor-store-provider";
import { usePlayback } from "@/components/editor/editor-playback-context";
import { deletePiece, removeCaption, splitPieceInDoc } from "@/lib/editor/captions";
import { pieceLimit } from "@/lib/editor/reconcile";
import { locate, pieceOffsets, setTrim, withPieces } from "@/lib/editor/timeline";

/** The timeline's edits, shared by its buttons and the keyboard (spec §6). */
export function useTimelineActions() {
  const store = useEditorStoreApi();
  const { time, seek } = usePlayback();

  const split = useCallback(() => {
    const { doc, sources, apply } = store.getState();
    const at = locate(doc.pieces, time);
    if (!at) return;
    const piece = doc.pieces[at.index];
    const source = sources.find((s) => s.nodeId === piece.sourceNodeId);
    const limit = source && pieceLimit(piece, source);
    if (!limit) return;
    apply((d) => splitPieceInDoc(d, piece.id, piece.in + at.local, crypto.randomUUID(), limit.fps) ?? d);
  }, [store, time]);

  const deleteSelection = useCallback(() => {
    const { selection, apply } = store.getState();
    if (!selection) return;
    apply((d) => (selection.kind === "piece" ? deletePiece(d, selection.id) : removeCaption(d, selection.id)));
  }, [store]);

  /** Trims one edge to a source time and shows the frame being cut on. */
  const trim = useCallback(
    (pieceId: string, edge: "in" | "out", seconds: number) => {
      const { doc, sources, apply } = store.getState();
      const piece = doc.pieces.find((p) => p.id === pieceId);
      const source = piece && sources.find((s) => s.nodeId === piece.sourceNodeId);
      const limit = piece && source && pieceLimit(piece, source);
      if (!limit) return;
      apply((d) => withPieces(d, setTrim(d.pieces, pieceId, edge, seconds, limit)));
      const next = store.getState().doc.pieces;
      const i = next.findIndex((p) => p.id === pieceId);
      if (i < 0) return;
      const offset = pieceOffsets(next)[i];
      const p = next[i];
      seek(edge === "in" ? offset : offset + (p.out - p.in) - 1 / limit.fps, next);
    },
    [store, seek],
  );

  return { split, deleteSelection, trim };
}
