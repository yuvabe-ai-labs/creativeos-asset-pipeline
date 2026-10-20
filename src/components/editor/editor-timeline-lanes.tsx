"use client";
// The Audio and Dub lanes (mockup): each piece's own sound, and its dub when it plays one. They
// move with their piece and aren't edited separately (spec §6).
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { laneBox } from "@/lib/editor/timeline-scale";
import type { Piece, SourceView } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

type Row = { piece: Piece; offset: number; source: SourceView | undefined; selected: boolean };

export function EditorAudioLane({ rows, scale, onSeek }: { rows: Row[]; scale: number; onSeek(t: number): void }) {
  return (
    <div className="relative h-[26px]">
      {rows.map(({ piece, offset, source, selected }) => {
        const box = laneBox(offset, piece.out - piece.in, scale);
        const silent = !source?.files.original.facts?.audio;
        const off = piece.sound === "dubbed";
        return (
          <div
            key={piece.id}
            onClick={() => onSeek(offset)}
            style={{ left: box.left, width: Math.max(4, box.width - 2) }}
            className={cn(
              "absolute flex h-[26px] cursor-pointer items-center overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px] text-muted-foreground",
              off ? "border border-dashed border-border line-through" : "border bg-muted/60",
              !off && (selected ? "border-primary" : "border-border"),
            )}
          >
            {silent ? "No sound" : off ? "Original (off)" : "Original"}
          </div>
        );
      })}
    </div>
  );
}

export function EditorDubLane({ rows, scale, onSeek }: { rows: Row[]; scale: number; onSeek(t: number): void }) {
  return (
    <div className="relative h-[26px]">
      {rows
        .filter((r) => r.piece.sound === "dubbed")
        .map(({ piece, offset, source }) => {
          const box = laneBox(offset, piece.out - piece.in, scale);
          return (
            <div
              key={piece.id}
              onClick={() => onSeek(offset)}
              style={{ left: box.left, width: Math.max(4, box.width - 2) }}
              className="absolute flex h-[26px] cursor-pointer items-center overflow-hidden whitespace-nowrap rounded-md border border-primary/40 bg-primary/10 px-2 text-[11px] text-primary"
            >
              Dub{source?.language ? ` · ${dubLanguageLabel(source.language)}` : ""}
            </div>
          );
        })}
    </div>
  );
}
