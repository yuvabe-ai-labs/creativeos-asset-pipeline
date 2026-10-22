"use client";
// The Audio and Dub lanes (spec A5). Audio: each piece's playing sound as a waveform, quiet
// stretches shaded on it (click to jump, right-click to split around one). Dub: each dubbed
// source's dub, dimmed when its clip plays the original; a stripe while a dub or lip sync runs.
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useQuietWindows } from "@/hooks/queries/editor";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { splitPieceInDoc } from "@/lib/editor/captions";
import { pieceSoundFile } from "@/lib/editor/playback";
import { pieceLimit } from "@/lib/editor/reconcile";
import { quietSections } from "@/lib/editor/silence";
import { formatTime } from "@/lib/editor/timeline";
import { laneBox } from "@/lib/editor/timeline-scale";
import type { Piece, SourceView } from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";
import { EditorWaveform } from "./editor-waveform";

export type LaneRow = { piece: Piece; offset: number; source: SourceView | undefined; selected: boolean };

export const AUDIO_LANE_PX = 44;
export const DUB_LANE_PX = 30;

function AudioPiece({ row, scale, onSeek }: { row: LaneRow; scale: number; onSeek(t: number): void }) {
  const store = useEditorStoreApi();
  const editable = useEditorStore((s) => s.editable);
  const { piece, offset, source, selected } = row;
  const sound = source ? pieceSoundFile(piece, source) : null;
  const silent = !sound?.facts?.audio;
  const { data } = useQuietWindows(silent ? null : sound!.url);
  const box = laneBox(offset, piece.out - piece.in, scale);
  const w = Math.max(4, box.width - 2);
  const quiet = data ? quietSections(data, piece.in, piece.out) : [];

  const splitAround = (a: number, b: number) => {
    if (!source) return;
    const limit = pieceLimit(piece, source);
    if (!limit) return;
    store.getState().begin();
    store.getState().apply((d) => {
      const first = splitPieceInDoc(d, piece.id, b, crypto.randomUUID(), limit.fps) ?? d;
      return splitPieceInDoc(first, piece.id, a, crypto.randomUUID(), limit.fps) ?? first;
    });
    store.getState().commit();
  };

  return (
    <div
      style={{ left: box.left, width: w, height: AUDIO_LANE_PX - 8 }}
      className={cn("absolute top-1 overflow-hidden rounded-md bg-muted/70", selected ? "ring-1 ring-primary" : "ring-1 ring-border")}
      onClick={(e) => onSeek(offset + (e.clientX - e.currentTarget.getBoundingClientRect().left) / scale)}
    >
      {silent ? (
        <span className="absolute inset-0 flex items-center px-2 text-[11px] text-muted-foreground">No sound</span>
      ) : (
        <EditorWaveform windows={data} from={piece.in} to={piece.out} width={w} height={AUDIO_LANE_PX - 8} muted={false} />
      )}
      {piece.sound === "dubbed" && <span className="absolute right-1.5 top-1 rounded bg-card/90 px-1 text-[10px] text-muted-foreground">Dub plays</span>}
      {quiet.map(([a, b]) => (
        <ContextMenu key={a}>
          <ContextMenuTrigger
            render={
              <span
                title={`Quiet ${formatTime(a - piece.in)}–${formatTime(b - piece.in)} · click to jump`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(offset + (a - piece.in) + 0.001);
                }}
                style={{ left: (a - piece.in) * scale, width: Math.max(2, (b - a) * scale) }}
                className="absolute inset-y-0 cursor-pointer border-x border-dashed border-muted-foreground/50 bg-[repeating-linear-gradient(135deg,rgba(17,24,39,.09)_0_4px,transparent_4px_8px)] transition-colors duration-200 hover:bg-[repeating-linear-gradient(135deg,rgba(88,41,199,.18)_0_4px,transparent_4px_8px)]"
              />
            }
          />
          <ContextMenuContent>
            <ContextMenuItem onClick={() => onSeek(offset + (a - piece.in) + 0.001)}>Jump to this quiet stretch</ContextMenuItem>
            <ContextMenuItem disabled={!editable} onClick={() => splitAround(a, b)}>
              Split around it
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </div>
  );
}

export function EditorAudioLane({ rows, scale, onSeek }: { rows: LaneRow[]; scale: number; onSeek(t: number): void }) {
  return (
    <div className="relative" style={{ height: AUDIO_LANE_PX }}>
      {rows.map((row) => (
        <AudioPiece key={row.piece.id} row={row} scale={scale} onSeek={onSeek} />
      ))}
    </div>
  );
}

export function EditorDubLane({ rows, scale, onSeek, busy }: { rows: LaneRow[]; scale: number; onSeek(t: number): void; busy: ReadonlyMap<string, "dub" | "lipsync"> }) {
  return (
    <div className="relative" style={{ height: DUB_LANE_PX }}>
      {rows.map(({ piece, offset, source }) => {
        const box = laneBox(offset, piece.out - piece.in, scale);
        const style = { left: box.left, width: Math.max(4, box.width - 2), height: DUB_LANE_PX - 8 };
        const running = source ? busy.get(source.nodeId) : undefined;
        if (running) {
          return (
            <div key={piece.id} style={style} className="absolute top-1 flex animate-pulse items-center overflow-hidden whitespace-nowrap rounded-md bg-primary/10 px-2 text-[11px] text-primary">
              {running === "dub" ? "Dubbing…" : "Lip-syncing…"}
            </div>
          );
        }
        if (!source?.files.dubAudio) return null;
        const on = piece.sound === "dubbed";
        return (
          <div
            key={piece.id}
            onClick={() => onSeek(offset)}
            style={style}
            title={on ? "This clip plays the dub" : "This clip plays its original sound; the dub is off"}
            className={cn(
              "absolute top-1 flex cursor-pointer items-center overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px]",
              on ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "border border-dashed border-border text-muted-foreground",
            )}
          >
            Dub{source.language ? ` · ${dubLanguageLabel(source.language)}` : ""}
            {on ? "" : " · off"}
          </div>
        );
      })}
    </div>
  );
}
