"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useEdgeAutoscroll } from "@/hooks/use-edge-autoscroll";
import { useTimelineActions } from "@/hooks/use-timeline-actions";
import { formatTime, movePiece, pieceOffsets, withPieces } from "@/lib/editor/timeline";
import { reorderIndex, snapTarget } from "@/lib/editor/timeline-view";
import { useEditorStoreApi } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { useEditorView } from "./editor-view-context";

type Drag = {
  pieceId: string;
  edge: "in" | "out" | null;
  startX: number;
  startScroll: number;
  in0: number;
  out0: number;
  from: number;
  moved: boolean;
  lastX: number;
  lastY: number;
  /** Alt is held: trim without snapping (D415). */
  free: boolean;
};

export type DragView = {
  /** The piece being moved (shown as a ghost in place), or null. */
  movingId: string | null;
  /** Where it would land, as an insertion index, while moving. */
  dropIndex: number | null;
  /** Reel seconds of the line a trim snapped to. */
  snapAt: number | null;
  tip: { x: number; y: number; text: string } | null;
};

const THRESHOLD_PX = 4;
const NONE: DragView = { movingId: null, dropIndex: null, snapAt: null, tip: null };

/** Moving and trimming clips with the pointer (D404): a drop marker, edge auto-scroll, snapping
 *  trims (always; Alt trims freely, D415), and one undo step per drag (D400). A press without
 *  movement selects the clip there. */
export function useTimelineDrag(contentRef: RefObject<HTMLDivElement | null>) {
  const store = useEditorStoreApi();
  const { time, seek, pause } = usePlayback();
  const { zoom, scrollerRef } = useEditorView();
  const { trim } = useTimelineActions();
  const drag = useRef<Drag | null>(null);
  const [view, setView] = useState<DragView>(NONE);
  const live = useRef({ zoom, time });
  useEffect(() => {
    live.current = { zoom, time };
  }, [zoom, time]);

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const d = drag.current;
      const content = contentRef.current;
      const scroller = scrollerRef.current;
      if (!d || !content || !scroller) return;
      d.lastX = clientX;
      d.lastY = clientY;
      const dx = clientX - d.startX + (scroller.scrollLeft - d.startScroll);
      if (!d.moved && Math.abs(dx) < THRESHOLD_PX) return;
      d.moved = true;
      const { zoom: z, time: playhead } = live.current;
      const snapOn = !d.free;
      const { doc } = store.getState();
      const index = doc.pieces.findIndex((p) => p.id === d.pieceId);
      if (index < 0) return;
      const offsets = pieceOffsets(doc.pieces);
      const offset = offsets[index];

      if (d.edge) {
        let seconds = (d.edge === "in" ? d.in0 : d.out0) + dx / z;
        let snapAt: number | null = null;
        if (snapOn && d.edge === "out") {
          // the clip's end, on the reel, against the playhead and every other clip's edges
          const others = offsets.flatMap((o, i) => (i === index ? [] : [o, o + doc.pieces[i].out - doc.pieces[i].in]));
          const hit = snapTarget(offset + (seconds - d.in0), [playhead, ...others], z);
          if (hit !== null) {
            seconds = d.in0 + (hit - offset);
            snapAt = hit;
          }
        } else if (snapOn && d.edge === "in" && playhead > offset && playhead < offset + (d.out0 - d.in0)) {
          // trim the start to the frame under the playhead
          const atPlayhead = d.in0 + (playhead - offset);
          if (snapTarget(seconds, [atPlayhead], z) !== null) {
            seconds = atPlayhead;
            snapAt = offset;
          }
        }
        trim(d.pieceId, d.edge, seconds);
        const p = store.getState().doc.pieces.find((x) => x.id === d.pieceId);
        setView({
          movingId: null,
          dropIndex: null,
          snapAt,
          tip: p ? { x: clientX, y: clientY, text: `${d.edge === "in" ? "In" : "Out"} ${formatTime(d.edge === "in" ? p.in : p.out)} · length ${formatTime(p.out - p.in)}` } : null,
        });
      } else {
        const seconds = (clientX - content.getBoundingClientRect().left) / z;
        const dropIndex = reorderIndex(seconds, doc.pieces);
        const to = dropIndex > d.from ? dropIndex - 1 : dropIndex;
        setView({ movingId: d.pieceId, dropIndex, snapAt: null, tip: { x: clientX, y: clientY, text: to === d.from ? "Same place" : `Move to position ${to + 1}` } });
      }
    },
    [contentRef, scrollerRef, store, trim],
  );

  const auto = useEdgeAutoscroll(scrollerRef, (x) => update(x, drag.current?.lastY ?? 0));

  const end = useCallback(
    (clientX: number) => {
      const d = drag.current;
      drag.current = null;
      auto.stop();
      setView(NONE);
      if (!d) return;
      const { doc, apply, select, commit } = store.getState();
      if (!d.moved) {
        commit();
        const index = doc.pieces.findIndex((p) => p.id === d.pieceId);
        const content = contentRef.current;
        if (index < 0 || !content) return;
        select({ kind: "piece", id: d.pieceId });
        seek(Math.max(0, (clientX - content.getBoundingClientRect().left) / live.current.zoom));
        return;
      }
      if (!d.edge) {
        const content = contentRef.current;
        if (content) {
          const dropIndex = reorderIndex((clientX - content.getBoundingClientRect().left) / live.current.zoom, doc.pieces);
          const to = dropIndex > d.from ? dropIndex - 1 : dropIndex;
          apply((cur) => withPieces(cur, movePiece(cur.pieces, d.from, Math.min(to, cur.pieces.length - 1))));
        }
      }
      select({ kind: "piece", id: d.pieceId });
      commit();
    },
    [auto, contentRef, seek, store],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      drag.current.free = e.altKey;
      update(e.clientX, e.clientY);
      if (drag.current?.moved) auto.move(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      if (drag.current) end(e.clientX);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [update, end, auto]);

  /** Start a drag on a piece (`edge` null: move it). */
  const begin = useCallback(
    (e: React.PointerEvent, pieceId: string, edge: "in" | "out" | null) => {
      if (e.button !== 0) return;
      const { doc, editable } = store.getState();
      const from = doc.pieces.findIndex((p) => p.id === pieceId);
      if (from < 0) return;
      e.preventDefault();
      e.stopPropagation();
      pause();
      if (!editable && edge) return;
      store.getState().begin();
      const p = doc.pieces[from];
      drag.current = { pieceId, edge: editable ? edge : null, startX: e.clientX, startScroll: scrollerRef.current?.scrollLeft ?? 0, in0: p.in, out0: p.out, from, moved: false, lastX: e.clientX, lastY: e.clientY, free: e.altKey };
      if (!editable) drag.current.moved = false;
    },
    [pause, scrollerRef, store],
  );

  return { begin, view };
}
