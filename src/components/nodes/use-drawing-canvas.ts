"use client";

import { useCallback, useRef, useState } from "react";
import { drawingContextSettings, type DrawTool } from "@/lib/nodes/draw-canvas";

// The two reel frames. Real pixel dimensions; the canvas is displayed scaled-to-fit, so the
// exported PNG aspect is deterministic. Coordinate mapping reads the live buffer size, so the
// drawing logic doesn't care which orientation is active.
export const CANVAS_SIZES = {
  portrait: { w: 720, h: 1280, label: "9:16" },
  square: { w: 1024, h: 1024, label: "1:1" },
  landscape: { w: 1280, h: 720, label: "16:9" },
} as const;

export type CanvasOrientation = keyof typeof CANVAS_SIZES;

// black, red, green
export const DRAW_COLORS = ["#171717", "#dc2626", "#16a34a"] as const;

function fillWhite(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Size the backing buffer to the given frame and paint it white. Call this from a callback
// ref so it runs exactly when the canvas attaches: the Base UI Sheet portals and UNMOUNTS
// its content, so the element only exists once the sheet is open — an effect keyed on mount
// sees a null ref and never re-runs. Without this the buffer stays the default 300x150 and
// strokes land off-canvas. Re-keying the canvas on orientation change remounts it, so this
// re-runs at the new size (and gives a fresh sheet on flip / reopen).
export function initDrawingCanvas(el: HTMLCanvasElement, w: number, h: number) {
  el.width = w;
  el.height = h;
  const ctx = el.getContext("2d");
  if (ctx) fillWhite(ctx, w, h);
}

// The canvas ref is owned by the component (the blessed pattern — see FileFocusView) and
// passed in. Drawing handlers read the element from `e.currentTarget`, so they never touch
// the ref during render. `clear`/`toBlob` read `ref.current` only inside callbacks.
export function useDrawingCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState<string>(DRAW_COLORS[0]);

  const toCanvasPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    // Scale by the live buffer size so mapping is correct in either orientation.
    return {
      x: ((e.clientX - rect.left) / rect.width) * el.width,
      y: ((e.clientY - rect.top) / rect.height) * el.height,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastRef.current = toCanvasPoint(e);
    },
    [toCanvasPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const ctx = e.currentTarget.getContext("2d");
      if (!ctx) return;
      const p = toCanvasPoint(e);
      const last = lastRef.current ?? p;
      const s = drawingContextSettings(tool, color);
      ctx.globalCompositeOperation = s.globalCompositeOperation;
      ctx.strokeStyle = s.strokeStyle;
      ctx.lineWidth = s.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastRef.current = p;
    },
    [toCanvasPoint, tool, color],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const clear = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    fillWhite(ctx, el.width, el.height);
  }, [canvasRef]);

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const el = canvasRef.current;
        if (!el) return resolve(null);
        el.toBlob((b) => resolve(b), "image/png");
      }),
    [canvasRef],
  );

  return {
    tool,
    setTool,
    color,
    setColor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave: onPointerUp,
    clear,
    toBlob,
  };
}
