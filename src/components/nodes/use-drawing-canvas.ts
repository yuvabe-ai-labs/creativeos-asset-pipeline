"use client";

import { useCallback, useRef, useState } from "react";
import { drawingContextSettings, type DrawTool } from "@/lib/nodes/draw-canvas";

// Fixed 9:16 reel frame. Displayed scaled-to-fit; these are the real pixel dimensions, so
// the exported PNG aspect is deterministic regardless of window size.
const CANVAS_W = 720;
const CANVAS_H = 1280;
const STROKE_WIDTH = 4;

// black, red, green
export const DRAW_COLORS = ["#171717", "#dc2626", "#16a34a"] as const;

function fillWhite(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

// Size the backing buffer to the fixed 9:16 frame and paint it white. Call this from a
// callback ref so it runs exactly when the canvas attaches: the Base UI Sheet portals and
// UNMOUNTS its content, so the element only exists once the sheet is open — an effect keyed
// on mount sees a null ref and never re-runs. Without this the buffer stays the default
// 300x150, and strokes (mapped into the 720x1280 space) land off-canvas. Running on every
// (re)mount also gives the one-shot "fresh canvas on reopen" behavior.
export function initDrawingCanvas(el: HTMLCanvasElement) {
  el.width = CANVAS_W;
  el.height = CANVAS_H;
  const ctx = el.getContext("2d");
  if (ctx) fillWhite(ctx);
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
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
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
      ctx.lineWidth = STROKE_WIDTH;
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
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    fillWhite(ctx);
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
