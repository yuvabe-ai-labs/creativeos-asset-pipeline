"use client";
// The timeline (D403, D404): a header of tools, then lanes in their own scroll area. Lanes, top to
// bottom: Video (frames), Audio (waveform, quiet stretches), Dub, Captions. It zooms, follows the
// playhead while playing, and clips move and trim by pointer with edge auto-scroll and snapping.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { pieceOffsets } from "@/lib/editor/timeline";
import { followScroll } from "@/lib/editor/timeline-view";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { AUDIO_LANE_PX, DUB_LANE_PX, EditorAudioLane, EditorDubLane, type LaneRow } from "./editor-timeline-lanes";
import { EditorTimelinePiece, VIDEO_LANE_PX } from "./editor-timeline-piece";
import { EditorTimelineRuler, RULER_PX } from "./editor-timeline-ruler";
import { EditorTimelineToolbar } from "./editor-timeline-toolbar";
import { useEditorView } from "./editor-view-context";
import { useTimelineDrag } from "./use-timeline-drag";

const CAPTION_LANE_PX = 34;
const END_ROOM_PX = 200;
const NO_BUSY: ReadonlyMap<string, "dub" | "lipsync"> = new Map();

const LANES = [
  { label: "", h: RULER_PX },
  { label: "Video", h: VIDEO_LANE_PX },
  { label: "Audio", h: AUDIO_LANE_PX },
  { label: "Dub", h: DUB_LANE_PX },
  { label: "Captions", h: CAPTION_LANE_PX },
];

export function EditorTimeline({ height, captionsLane, tools, dubBusy = NO_BUSY }: {
  height: number;
  captionsLane?: (scale: number) => ReactNode;
  tools?: ReactNode;
  dubBusy?: ReadonlyMap<string, "dub" | "lipsync">;
}) {
  const pieces = useEditorStore((s) => s.doc.pieces);
  const sources = useEditorStore((s) => s.sources);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const { time, total, seek, pause, playing } = usePlayback();
  const { zoom, zoomBy, scrollerRef } = useEditorView();
  const contentRef = useRef<HTMLDivElement>(null);
  const { begin, view } = useTimelineDrag(contentRef);
  const [viewWidth, setViewWidth] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollerRef]);

  // Ctrl/⌘ + wheel zooms (a non-passive listener, so the page doesn't zoom instead).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollerRef, zoomBy]);

  // While playing, keep the playhead in view.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!playing || !el) return;
    const next = followScroll(time, zoom, el.scrollLeft, el.clientWidth);
    if (next !== null) el.scrollLeft = next;
  }, [playing, time, zoom, scrollerRef]);

  const offsets = pieceOffsets(pieces);
  const rows: LaneRow[] = pieces.map((piece, i) => ({
    piece,
    offset: offsets[i],
    source: sources.find((s) => s.nodeId === piece.sourceNodeId),
    selected: selection?.kind === "piece" && selection.id === piece.id,
  }));
  const contentWidth = Math.max(viewWidth, total * zoom + END_ROOM_PX);
  const seekAndClear = (t: number) => {
    pause();
    seek(Math.max(0, Math.min(total, t)));
  };
  const onEmpty = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    seekAndClear((e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom);
    select(null);
  };
  const dropX = view.dropIndex === null ? null : (view.dropIndex < pieces.length ? offsets[view.dropIndex] : total) * zoom;

  return (
    <section aria-label="Timeline" style={{ height }} className="mx-4 mb-3 flex flex-none flex-col overflow-hidden rounded-[14px] border border-border bg-card">
      <EditorTimelineToolbar tools={tools} />
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div aria-hidden="true" className="flex w-[72px] flex-none flex-col border-r border-border text-xs text-muted-foreground">
          {LANES.map((l) => (
            <span key={l.label || "ruler"} style={{ height: l.h }} className="flex flex-none items-center px-3">
              {l.label}
            </span>
          ))}
        </div>
        <div ref={scrollerRef} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div ref={contentRef} className="relative" style={{ width: contentWidth }}>
            <EditorTimelineRuler time={time} total={total} width={contentWidth} onScrubStart={pause} onScrub={(t) => seek(t)} />
            <div className="relative" style={{ height: VIDEO_LANE_PX }} onClick={onEmpty}>
              {rows.map(({ piece, offset, source, selected }, i) => (
                <EditorTimelinePiece
                  key={piece.id}
                  piece={piece}
                  index={i}
                  source={source}
                  left={offset * zoom}
                  width={(piece.out - piece.in) * zoom}
                  selected={selected}
                  moving={view.movingId === piece.id}
                  onBegin={(e, edge) => begin(e, piece.id, edge)}
                />
              ))}
              {dropX !== null && <div aria-hidden className="pointer-events-none absolute inset-y-0 z-30 w-[3px] -translate-x-1/2 rounded-full bg-primary" style={{ left: dropX }} />}
            </div>
            <EditorAudioLane rows={rows} scale={zoom} onSeek={seekAndClear} />
            <EditorDubLane rows={rows} scale={zoom} onSeek={seekAndClear} busy={dubBusy} />
            <div className="relative" style={{ height: CAPTION_LANE_PX }} onClick={onEmpty}>
              {captionsLane?.(zoom)}
            </div>
            {view.snapAt !== null && <div aria-hidden className="pointer-events-none absolute inset-y-0 z-30 w-px bg-amber-500" style={{ left: view.snapAt * zoom }} />}
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-primary" style={{ left: Math.min(time, total) * zoom }}>
              <span className="absolute -left-[5px] top-0 size-3 rotate-45 bg-primary" />
            </div>
          </div>
        </div>
      </div>
      {view.tip && (
        <div className="pointer-events-none fixed z-50 rounded-md bg-foreground px-2 py-1 text-[11px] tabular-nums text-background" style={{ left: view.tip.x + 12, top: view.tip.y - 30 }}>
          {view.tip.text}
        </div>
      )}
    </section>
  );
}
