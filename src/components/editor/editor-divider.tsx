"use client";

import { useRef } from "react";

/** The handle between the preview and the timeline (D403): drag to give either more room. */
export function EditorDivider({ height, onResize }: { height: number; onResize(h: number): void }) {
  const start = useRef<{ y: number; h: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the timeline"
      title="Drag to resize the timeline"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, h: height };
      }}
      onPointerMove={(e) => {
        if (start.current) onResize(start.current.h - (e.clientY - start.current.y));
      }}
      onPointerUp={(e) => {
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      className="group flex h-3 flex-none cursor-row-resize touch-none items-center justify-center"
    >
      <span className="h-[3px] w-10 rounded-full bg-border transition-colors duration-200 group-hover:bg-primary group-active:bg-primary" />
    </div>
  );
}
