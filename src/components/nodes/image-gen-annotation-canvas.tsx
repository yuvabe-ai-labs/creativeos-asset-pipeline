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
import { Slider } from "@/components/ui/slider";
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

const MIN_BRUSH = 2;
const MAX_BRUSH = 64;
const DEFAULT_BRUSH = 12;

// GCS public objects don't send CORS headers, so a `crossOrigin` load of the base image fails
// and its pixels can't be read back out of a canvas (toDataURL taints). Route through our
// same-origin proxy (/api/image-proxy) so the image is same-origin and canvas readback is
// allowed with no bucket-CORS change (D37 §8).
function proxied(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load base image for annotation"));
    img.src = proxied(url);
  });
}

export const ImageGenAnnotationCanvas = forwardRef<AnnotationHandle, Props>(
  function ImageGenAnnotationCanvas({ baseUrl, alt, onMarksChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dirtyRef = useRef(false);
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
    const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);

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
    } = useDrawingCanvas(canvasRef, { transparent: true, size: brushSize });

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

    // A small preview dot for the current brush size, scaled from canvas px into a legible
    // display size (the buffer is at the image's natural resolution, so px are large).
    const previewPx = Math.max(3, Math.min(18, Math.round(brushSize / 1.6)));

    return (
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Canvas area */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
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

        {/* Right rail — colors · eraser · brush size · clear */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-3 rounded-xl border border-border bg-card px-2 py-3">
          <div className="flex flex-col items-center gap-2">
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
          </div>

          <span className="h-px w-6 bg-border" />

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

          {/* Brush size — vertical slider with a live preview dot */}
          <div className="flex flex-1 flex-col items-center gap-2 py-1">
            <span
              className="shrink-0 rounded-full bg-foreground"
              style={{ width: previewPx, height: previewPx }}
              aria-hidden
            />
            <Slider
              orientation="vertical"
              min={MIN_BRUSH}
              max={MAX_BRUSH}
              value={[brushSize]}
              onValueChange={(v) => setBrushSize(Array.isArray(v) ? v[0] : v)}
              aria-label="Brush size"
              className="flex-1"
            />
          </div>

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
