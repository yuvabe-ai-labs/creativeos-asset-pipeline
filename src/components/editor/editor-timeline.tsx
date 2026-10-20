"use client";
// The timeline (mockup): full width under the stage, at a fixed scale (a 20 s window that scrolls).
// Lanes, top to bottom: Video, Audio, Dub, Captions.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimelineActions } from "@/hooks/use-timeline-actions";
import { pieceLimit } from "@/lib/editor/reconcile";
import { movePiece, pieceOffsets } from "@/lib/editor/timeline";
import { laneBox, pxPerSecond } from "@/lib/editor/timeline-scale";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { EditorAudioLane, EditorDubLane } from "./editor-timeline-lanes";
import { EditorTimelinePiece } from "./editor-timeline-piece";
import { EditorTimelineRuler } from "./editor-timeline-ruler";

const TONES = ["bg-muted", "bg-accent", "bg-secondary"];
const LANES = [
  { label: "Video", h: "h-[60px] mt-1.5" },
  { label: "Audio", h: "h-[26px] mt-1" },
  { label: "Dub", h: "h-[26px] mt-1" },
  { label: "Captions", h: "h-[26px] mt-1" },
];

export function EditorTimeline({ captionsLane }: { captionsLane?: (scale: number) => ReactNode }) {
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const { time, total, seek, pause } = usePlayback();
  const { split, deleteSelection, trim } = useTimelineActions();

  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = pxPerSecond(width);
  const contentWidth = Math.max(width, total * scale + 48);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const offsets = pieceOffsets(doc.pieces);
  const sourceIndex = new Map(sources.map((s, i) => [s.nodeId, i]));
  const rows = doc.pieces.map((piece, i) => ({
    piece,
    offset: offsets[i],
    source: sources.find((s) => s.nodeId === piece.sourceNodeId),
    selected: selection?.kind === "piece" && selection.id === piece.id,
  }));

  return (
    <section aria-label="Timeline" className="mx-6 mb-5 mt-4 flex min-h-0 flex-1 flex-col gap-2 rounded-[14px] border border-border bg-card px-4 pb-3.5 pt-3">
      <div className="flex items-center gap-2.5">
        <span className="text-eyebrow text-muted-foreground">Timeline</span>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground">Drag edges to trim · drag to reorder · S split · ⌫ delete · Space play</span>
        <Button variant="outline" size="sm" onClick={split} disabled={!editable || total === 0} className="gap-1.5">
          <Scissors className="size-3.5" strokeWidth={1.5} />
          Split
        </Button>
        <Button variant="outline" size="sm" onClick={deleteSelection} disabled={!editable || !selection}>
          Delete
        </Button>
      </div>
      <div className="flex min-h-0 gap-2.5">
        <div aria-hidden="true" className="flex w-16 flex-none flex-col text-xs text-muted-foreground">
          <span className="h-[22px]" />
          {LANES.map((l) => (
            <span key={l.label} className={`flex items-center ${l.h}`}>{l.label}</span>
          ))}
        </div>
        <div ref={trackRef} className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width: contentWidth }}>
            <EditorTimelineRuler time={time} total={total} scale={scale} width={contentWidth} onScrubStart={pause} onScrub={(t) => seek(t)} />
            <div className="relative mt-1.5 h-[60px]">
              {rows.map(({ piece, offset, source, selected }, i) => {
                const box = laneBox(offset, piece.out - piece.in, scale);
                const fps = (source && pieceLimit(piece, source)?.fps) ?? 24;
                const label = `${i + 1}. ${source?.handle ?? "Missing clip"}${piece.picture === "lipSynced" ? " · lip-synced" : ""}`;
                return (
                  <EditorTimelinePiece
                    key={piece.id}
                    piece={piece}
                    index={i}
                    label={label}
                    tone={TONES[(sourceIndex.get(piece.sourceNodeId) ?? 0) % TONES.length]}
                    left={box.left}
                    width={box.width}
                    scale={scale}
                    fps={fps}
                    selected={selected}
                    onSelectAt={(local) => {
                      select({ kind: "piece", id: piece.id });
                      seek(offset + local);
                    }}
                    onTrim={(edge, s) => editable && trim(piece.id, edge, s)}
                    onDragStart={() => setDragFrom(i)}
                    onDrop={() => {
                      if (dragFrom !== null) apply((d) => ({ ...d, pieces: movePiece(d.pieces, dragFrom, i) }));
                      setDragFrom(null);
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-1"><EditorAudioLane rows={rows} scale={scale} onSeek={seek} /></div>
            <div className="mt-1"><EditorDubLane rows={rows} scale={scale} onSeek={seek} /></div>
            <div className="relative mt-1 h-[26px]">{captionsLane?.(scale)}</div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: Math.min(time, total) * scale }}>
              <span className="absolute -left-1 -top-[3px] size-2.5 rotate-45 bg-primary" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
