"use client";
// One piece on the Video lane: its own frames, its badges (dub, lip sync), edges to trim. Pointer
// handling lives in useTimelineDrag (D404); right-click opens the clip's menu (D405).
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { formatTime } from "@/lib/editor/timeline";
import type { Piece, SourceView } from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { EditorClipMenu } from "./editor-clip-menu";
import { EditorFilmstrip } from "./editor-filmstrip";

export const VIDEO_LANE_PX = 64;

export function EditorTimelinePiece({ piece, index, source, left, width, selected, moving, onBegin }: {
  piece: Piece;
  index: number;
  source: SourceView | undefined;
  left: number;
  width: number;
  selected: boolean;
  moving: boolean;
  onBegin(e: React.PointerEvent, edge: "in" | "out" | null): void;
}) {
  const picture = piece.picture === "lipSynced" && source?.files.lipSynced ? source.files.lipSynced : source?.files.original;
  const duration = picture?.facts?.durationSeconds ?? 0;
  const w = Math.max(4, width - 2);
  const h = VIDEO_LANE_PX - 8;
  const edge = (which: "in" | "out") => (
    <span
      aria-hidden
      title={`Drag to trim the ${which === "in" ? "start" : "end"}. It snaps to the playhead; hold Alt to trim freely.`}
      onPointerDown={(e) => onBegin(e, which)}
      className={cn(
        "absolute inset-y-0 z-10 w-2 cursor-ew-resize transition-colors duration-200 group-hover/piece:bg-primary/25 hover:bg-primary/45",
        selected && "bg-primary/40",
        which === "in" ? "left-0 rounded-l-md" : "right-0 rounded-r-md",
      )}
    />
  );

  return (
    <EditorClipMenu piece={piece} source={source}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Clip ${index + 1}, ${source?.handle ?? "missing"}, ${formatTime(piece.out - piece.in)}`}
        aria-pressed={selected}
        onPointerDown={(e) => onBegin(e, null)}
        style={{ left, width: w, height: h }}
        className={cn(
          "group/piece absolute top-1 cursor-grab touch-none select-none overflow-hidden rounded-lg bg-muted active:cursor-grabbing",
          selected ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-foreground/20",
          moving && "opacity-40",
        )}
      >
        {picture && <EditorFilmstrip url={picture.url} from={piece.in} to={piece.out} duration={duration} width={w} height={h} />}
        <span className="pointer-events-none absolute left-2 top-1.5 flex max-w-[calc(100%-1rem)] items-center gap-1 truncate text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.75)]">
          {index + 1}. {source?.handle ?? "Missing clip"}
          {piece.sound === "dubbed" && (
            <span className="rounded-full bg-emerald-100 px-1.5 text-[9.5px] text-emerald-800 [text-shadow:none]">{source?.language ? dubLanguageLabel(source.language) : "Dub"}</span>
          )}
          {piece.picture === "lipSynced" && <span className="rounded-full bg-primary/90 px-1.5 text-[9.5px] text-primary-foreground [text-shadow:none]">LIP</span>}
        </span>
        <span className="pointer-events-none absolute bottom-1 left-2 text-[10px] tabular-nums text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,.75)]">{formatTime(piece.out - piece.in)}</span>
        {edge("in")}
        {edge("out")}
      </div>
    </EditorClipMenu>
  );
}
