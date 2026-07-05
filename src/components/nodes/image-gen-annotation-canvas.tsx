"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Eraser, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useDrawingCanvas,
  initDrawingCanvas,
  DRAW_COLORS,
} from "./use-drawing-canvas";

export type AnnotationHandle = {
  hasMarks: () => boolean;
  toCompositeBase64: () => Promise<{ base64: string; mime: string } | null>;
  clear: () => void;
};

type Props = {
  baseUrl: string;
  alt?: string;
  onMarksChange?: (has: boolean) => void;
};

// Load the base image cross-origin so the composited canvas is readable (toDataURL). Base
// images are connected-node images in our storage (spec §7), which serve CORS.
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load base image for annotation"));
    img.src = url;
  });
}

export const ImageGenAnnotationCanvas = forwardRef<AnnotationHandle, Props>(
  function ImageGenAnnotationCanvas({ baseUrl, alt, onMarksChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dirtyRef = useRef(false);
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

    const {
      tool,
      setTool,
      color,
      setColor,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerLeave,
      clear,
    } = useDrawingCanvas(canvasRef, { transparent: true });

    // Load the base image to learn its natural size, then size the overlay buffer to match so
    // marks map 1:1 to pixels; CSS scales it to the displayed box (getBoundingClientRect maps
    // pointer coords, so it works at any scale).
    useEffect(() => {
      let cancelled = false;
      void loadImage(baseUrl).then((img) => {
        if (cancelled) return;
        setDims({ w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 });
      });
      return () => {
        cancelled = true;
      };
    }, [baseUrl]);

    // Init the transparent buffer once the canvas element + dims exist.
    const setCanvasRef = useCallback(
      (el: HTMLCanvasElement | null) => {
        canvasRef.current = el;
        if (el && dims) initDrawingCanvas(el, dims.w, dims.h, { transparent: true });
      },
      [dims],
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dirtyRef.current) {
          dirtyRef.current = true;
          onMarksChange?.(true); // reactive flag so the prompt preview picks up the clause
        }
        onPointerDown(e);
      },
      [onPointerDown, onMarksChange],
    );

    const resetMarks = useCallback(() => {
      clear();
      dirtyRef.current = false;
      onMarksChange?.(false);
    }, [clear, onMarksChange]);

    useImperativeHandle(
      ref,
      () => ({
        hasMarks: () => dirtyRef.current,
        clear: resetMarks,
        toCompositeBase64: async () => {
          const overlay = canvasRef.current;
          if (!overlay || !dirtyRef.current) return null;
          const img = await loadImage(baseUrl);
          const out = document.createElement("canvas");
          out.width = img.naturalWidth;
          out.height = img.naturalHeight;
          const ctx = out.getContext("2d");
          if (!ctx) return null;
          ctx.drawImage(img, 0, 0);
          ctx.drawImage(overlay, 0, 0, out.width, out.height);
          const dataUrl = out.toDataURL("image/png");
          return { base64: dataUrl.split(",")[1] ?? "", mime: "image/png" };
        },
      }),
      [baseUrl, resetMarks],
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          {/* Wrapper matches the image aspect so the overlay lines up exactly. */}
          <div
            className="relative max-h-full max-w-full overflow-hidden rounded-xl border border-border bg-muted/20"
            style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={baseUrl}
              alt={alt || "Base image"}
              className="block size-full object-contain"
              draggable={false}
            />
            {dims && (
              <canvas
                ref={setCanvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
                className="nodrag absolute inset-0 size-full"
                style={{ cursor: "crosshair", touchAction: "none" }}
              />
            )}
          </div>
        </div>

        {/* Tool strip — reuse the Draw node's control cluster styling. */}
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setTool("pen");
              }}
              className={cn(
                "size-6 rounded-full border border-border transition",
                tool === "pen" && color === c && "ring-2 ring-primary ring-offset-1",
              )}
              style={{ backgroundColor: c }}
              aria-label={`Pen ${c}`}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setTool("eraser")}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md transition hover:bg-muted",
              tool === "eraser" && "ring-2 ring-primary ring-offset-1",
            )}
            aria-label="Eraser"
          >
            <Eraser className="size-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={resetMarks}
            className="inline-flex size-8 items-center justify-center rounded-md text-destructive transition hover:bg-muted"
            aria-label="Clear annotation"
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    );
  },
);
