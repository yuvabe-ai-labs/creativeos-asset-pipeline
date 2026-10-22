"use client";
// One piece on the Video lane (mockup "Editor, clip selected"). Drag an edge to trim (snapped to
// the picture's frames by setTrim), drag the body to reorder, click to select and move the
// playhead there. Arrow keys nudge a focused edge by a frame (Shift: 10). Pointer handling ported
// from the rough-cut spike's timeline-clip.
import { useRef } from "react";
import { formatTime } from "@/lib/editor/timeline";
import type { Piece } from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { useEditorStoreApi } from "./editor-store-provider";

type Edge = "in" | "out";

export function EditorTimelinePiece({ piece, index, label, tone, left, width, scale, fps, selected, onSelectAt, onTrim, onDragStart, onDrop }: {
  piece: Piece;
  index: number;
  label: string;
  tone: string;
  left: number;
  width: number;
  /** Pixels per second. */
  scale: number;
  fps: number;
  selected: boolean;
  onSelectAt(localSeconds: number): void;
  onTrim(edge: Edge, sourceSeconds: number): void;
  onDragStart(): void;
  onDrop(): void;
}) {
  const store = useEditorStoreApi();
  const trim = useRef<{ startX: number; seconds: number } | null>(null);
  const seconds = piece.out - piece.in;

  const handle = (edge: Edge) => {
    const at = edge === "in" ? piece.in : piece.out;
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={edge === "in" ? `Trim start of piece ${index + 1}` : `Trim end of piece ${index + 1}`}
        aria-valuenow={Math.round(at * fps)}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          trim.current = { startX: e.clientX, seconds: at };
          store.getState().begin(); // one undo step for the whole trim (D400)
        }}
        onPointerMove={(e) => {
          if (trim.current) onTrim(edge, trim.current.seconds + (e.clientX - trim.current.startX) / scale);
        }}
        onPointerUp={(e) => {
          if (!trim.current) return;
          trim.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
          store.getState().commit();
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          e.stopPropagation();
          const frames = (e.shiftKey ? 10 : 1) * (e.key === "ArrowLeft" ? -1 : 1);
          onTrim(edge, at + frames / fps);
        }}
        className={cn(
          "absolute inset-y-0 z-10 w-2 cursor-ew-resize outline-none transition-colors duration-200",
          "group-hover/piece:bg-primary/20 hover:bg-primary/35 focus-visible:bg-primary/35",
          selected && "bg-primary/35",
          edge === "in" ? "left-0 rounded-l-md" : "right-0 rounded-r-md",
        )}
      />
    );
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        if (trim.current) return e.preventDefault();
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSelectAt(Math.max(0, (e.clientX - rect.left) / scale));
      }}
      style={{ left, width: Math.max(4, width - 2) }}
      className={cn(
        "group/piece absolute top-0 h-[60px] cursor-pointer select-none overflow-hidden rounded-lg",
        tone,
        selected ? "border-2 border-primary" : "border border-border hover:border-foreground/20",
      )}
    >
      {handle("in")}
      <div className="flex h-full flex-col justify-between px-3 py-2">
        <span className={cn("truncate text-xs", selected && "font-semibold")}>{label}</span>
        <span className="truncate text-[11px] tabular-nums text-muted-foreground">{formatTime(seconds)}</span>
      </div>
      {handle("out")}
    </div>
  );
}
