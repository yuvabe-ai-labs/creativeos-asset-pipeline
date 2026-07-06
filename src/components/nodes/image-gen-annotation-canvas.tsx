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
import { overlayToMaskRGBA } from "@/lib/image-gen/mask";
import { useDrawingCanvas, initDrawingCanvas } from "./use-drawing-canvas";

// A single translucent brand-purple highlight — reads as a "mask" overlay, and the alpha we
// draw is all that matters (overlayToMaskRGBA only inspects painted-vs-not).
const MASK_COLOR = "rgba(88, 41, 199, 0.4)"; // #5829c7 @ 40%

export type AnnotationHandle = {
  hasMarks: () => boolean;
  toMaskBase64: () => Promise<{ base64: string; mime: string } | null>;
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

export const ImageGenAnnotationCanvas = forwardRef<AnnotationHandle, Props>(
  function ImageGenAnnotationCanvas({ baseUrl, alt, onMarksChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dirtyRef = useRef(false);
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
    const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);

    const {
      tool,
      setTool,
      setColor,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerLeave,
      clear,
    } = useDrawingCanvas(canvasRef, { transparent: true, size: brushSize });

    // Region painter: one fixed translucent mask color, pen tool by default.
    useEffect(() => {
      setColor(MASK_COLOR);
      setTool("pen");
    }, [setColor, setTool]);

    // Learn the base image's natural size from the <img> that already displays it, then size the
    // overlay buffer to match so marks map 1:1 to pixels; CSS scales it to the displayed box. The
    // mask never reads the base pixels, so no same-origin proxy is needed.
    const readDims = useCallback((img: HTMLImageElement) => {
      if (!img.naturalWidth) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      // Idempotent: skip if unchanged so we don't re-init (and clear) the canvas after painting.
      setDims((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    }, []);
    // Callback ref catches the already-cached case (a cached <img> may never fire onLoad); the
    // onLoad handler catches a fresh network load.
    const baseImgRef = useCallback(
      (img: HTMLImageElement | null) => {
        if (img?.complete) readDims(img);
      },
      [readDims],
    );
    const handleBaseLoad = useCallback(
      (e: React.SyntheticEvent<HTMLImageElement>) => readDims(e.currentTarget),
      [readDims],
    );

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
        // Convert the painted overlay into an OpenAI alpha edit-mask. The base image is never
        // read — the mask is base-independent (painted → editable, else preserved).
        toMaskBase64: async () => {
          const overlay = canvasRef.current;
          if (!overlay || !dirtyRef.current) return null;
          const octx = overlay.getContext("2d");
          if (!octx) return null;
          const src = octx.getImageData(0, 0, overlay.width, overlay.height);
          const mask = overlayToMaskRGBA({
            data: src.data,
            width: src.width,
            height: src.height,
          });
          const out = document.createElement("canvas");
          out.width = mask.width;
          out.height = mask.height;
          const ctx = out.getContext("2d");
          if (!ctx) return null;
          ctx.putImageData(new ImageData(mask.data, mask.width, mask.height), 0, 0);
          const dataUrl = out.toDataURL("image/png");
          return { base64: dataUrl.split(",")[1] ?? "", mime: "image/png" };
        },
      }),
      [resetMarks],
    );

    // A small preview dot for the current brush size, scaled from canvas px into a legible
    // display size (the buffer is at the image's natural resolution, so px are large).
    const previewPx = Math.max(3, Math.min(18, Math.round(brushSize / 1.6)));

    return (
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Canvas area */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
          <p className="text-xs text-muted-foreground">
            Paint over the area you want to change.
          </p>
          {/* Wrapper matches the image aspect so the overlay lines up exactly. */}
          <div
            className="relative max-h-full max-w-full overflow-hidden rounded-xl border border-border bg-muted/20"
            style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={baseImgRef}
              src={baseUrl}
              alt={alt || "Base image"}
              className="block size-full object-contain"
              draggable={false}
              onLoad={handleBaseLoad}
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

        {/* Right rail — brush/eraser · brush size · clear */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-3 rounded-xl border border-border bg-card px-2 py-3">
          <button
            type="button"
            onClick={() => setTool("pen")}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-md transition hover:bg-muted",
              tool === "pen" && "ring-2 ring-primary ring-offset-1",
            )}
            aria-label="Paint region"
          >
            <span className="size-4 rounded-full" style={{ backgroundColor: MASK_COLOR }} />
          </button>

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
