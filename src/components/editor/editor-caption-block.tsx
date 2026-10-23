"use client";
// A caption on the Captions lane, ported from the rough-cut spike. Drag the body to move it in
// time, drag an edge to change when it starts or ends. Times snap to sequence frames; a release
// without movement selects it. Reel times go to retimeCaption, which re-attaches the caption to
// the piece under its new start (D393).
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useEditorStoreApi } from "./editor-store-provider";

type Mode = "move" | "start" | "end";
const MIN_SECONDS = 0.2;
const DRAG_THRESHOLD_PX = 3;

export function EditorCaptionBlock({ text, start, end, scale, fps, total, selected, editable, onChange, onSelect }: {
  text: string;
  start: number;
  end: number;
  /** Pixels per second. */
  scale: number;
  fps: number;
  total: number;
  selected: boolean;
  editable: boolean;
  onChange(start: number, end: number): void;
  onSelect(): void;
}) {
  const store = useEditorStoreApi();
  const drag = useRef<{ mode: Mode; x: number; start: number; end: number; moved: boolean } | null>(null);
  const snap = (t: number) => Math.round(t * fps) / fps;

  const begin = (mode: Mode, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, start, end, moved: false };
    store.getState().begin(); // one undo step for the whole drag (D400)
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !editable) return;
    const dxPx = e.clientX - d.x;
    if (!d.moved && Math.abs(dxPx) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const dt = dxPx / scale;
    const len = d.end - d.start;
    if (d.mode === "move") {
      const s = snap(Math.min(Math.max(0, d.start + dt), Math.max(0, total - len)));
      onChange(s, s + len);
    } else if (d.mode === "start") {
      onChange(snap(Math.min(Math.max(0, d.start + dt), d.end - MIN_SECONDS)), d.end);
    } else {
      onChange(d.start, snap(Math.max(Math.min(total, d.end + dt), d.start + MIN_SECONDS)));
    }
  };
  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    store.getState().commit();
    if (!d.moved) onSelect();
  };

  const edge = (which: "start" | "end") => (
    <div
      aria-hidden
      onPointerDown={(e) => begin(which, e)}
      onPointerMove={move}
      onPointerUp={finish}
      className={cn(
        "absolute inset-y-0 z-10 w-2 cursor-ew-resize transition-colors duration-200 hover:bg-primary/40",
        which === "start" ? "left-0 rounded-l-md" : "right-0 rounded-r-md",
        selected && "bg-primary/30",
      )}
    />
  );

  return (
    <div
      onPointerDown={(e) => begin("move", e)}
      onPointerMove={move}
      onPointerUp={finish}
      style={{ left: start * scale, width: Math.max(6, (end - start) * scale) }}
      className={cn(
        "absolute inset-y-0 flex cursor-grab select-none items-center overflow-hidden whitespace-nowrap rounded-md border bg-card px-2 text-[11px] active:cursor-grabbing",
        selected ? "border-primary" : "border-border hover:border-foreground/20",
      )}
    >
      {edge("start")}
      <span className="truncate">{text}</span>
      {edge("end")}
    </div>
  );
}
