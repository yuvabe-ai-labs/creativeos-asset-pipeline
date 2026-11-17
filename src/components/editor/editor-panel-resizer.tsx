"use client";

import { useRef, type RefObject } from "react";
import { MAX_PANEL_SHARE, MIN_PANEL_SHARE, type PanelDock } from "@/lib/editor/layout";

const STEP = 0.02;

/** The handle between the preview and the side panel: drag to give either more width. Arrow keys
 *  move it too. The share is the panel's part of the row, measured from the side it is docked on. */
export function EditorPanelResizer({ rowRef, dock, share, onShare }: {
  rowRef: RefObject<HTMLElement | null>;
  dock: PanelDock;
  share: number;
  onShare(share: number): void;
}) {
  const dragging = useRef(false);
  const shareAt = (x: number) => {
    const r = rowRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return share;
    return dock === "right" ? (r.right - x) / r.width : (x - r.left) / r.width;
  };
  // Arrow toward the panel shrinks it; arrow away from it grows it.
  const grow = dock === "right" ? "ArrowLeft" : "ArrowRight";
  const shrink = dock === "right" ? "ArrowRight" : "ArrowLeft";

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the side panel"
      aria-valuemin={Math.round(MIN_PANEL_SHARE * 100)}
      aria-valuemax={Math.round(MAX_PANEL_SHARE * 100)}
      aria-valuenow={Math.round(share * 100)}
      tabIndex={0}
      title="Drag to resize the side panel"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
      }}
      onPointerMove={(e) => {
        if (dragging.current) onShare(shareAt(e.clientX));
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        if (e.key === grow) onShare(share + STEP);
        else if (e.key === shrink) onShare(share - STEP);
        else return;
        e.preventDefault();
      }}
      className="group flex w-3 cursor-col-resize touch-none items-center justify-center outline-none"
    >
      <span className="h-10 w-[3px] rounded-full bg-border transition-colors duration-200 group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
