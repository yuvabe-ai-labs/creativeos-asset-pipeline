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

export function useDrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState<string>(DRAW_COLORS[0]);

  // Pointer handlers are bound once; read the latest tool/color through refs.
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;

  const fillWhite = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }, []);

  // Ref callback: size the canvas and paint the white background once mounted.
  const setCanvasEl = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      if (!el) return;
      el.width = CANVAS_W;
      el.height = CANVAS_H;
      const ctx = el.getContext("2d");
      if (ctx) fillWhite(ctx);
    },
    [fillWhite],
  );

  const toCanvasPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = canvasRef.current!;
    const rect = el.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const el = canvasRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastRef.current = toCanvasPoint(e);
    },
    [toCanvasPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const el = canvasRef.current;
      if (!el) return;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const p = toCanvasPoint(e);
      const last = lastRef.current ?? p;
      const s = drawingContextSettings(toolRef.current, colorRef.current);
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
    [toCanvasPoint],
  );

  const endStroke = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastRef.current = null;
    const el = canvasRef.current;
    if (el && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }, []);

  const clear = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    fillWhite(ctx);
  }, [fillWhite]);

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const el = canvasRef.current;
        if (!el) return resolve(null);
        el.toBlob((b) => resolve(b), "image/png");
      }),
    [],
  );

  return {
    setCanvasEl,
    tool,
    setTool,
    color,
    setColor,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endStroke,
      onPointerLeave: endStroke,
    },
    clear,
    toBlob,
  };
}
