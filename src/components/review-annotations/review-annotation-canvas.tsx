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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { overlayToMaskRGBA } from "@/lib/image-gen/mask";
import { useDrawingCanvas, initDrawingCanvas } from "@/components/nodes/use-drawing-canvas";
import type { RegionBounds } from "@/lib/review-annotations/draft";

// Brand purple, drawn FULLY OPAQUE into the buffer (a translucent stroke compounds alpha at
// each overlapping round-cap → a dotted/beaded line). The translucent "mask overlay" look comes
// from CSS opacity on the canvas element instead (uniform, no compounding). overlayToMaskRGBA
// only inspects painted-vs-not, so opaque strokes give the cleanest mask.
const MASK_COLOR = "#5829c7";

export type AnnotationHandle = {
  hasMarks: () => boolean;
  toMaskBase64: () => Promise<{ base64: string; mime: string } | null>;
  // D243: the painted overlay itself, plus where it landed — what review annotations
  // store. Edit mode ignores both and keeps using toMaskBase64.
  toOverlayBase64: () => string | null;
  getStrokeBounds: () => RegionBounds | null;
  clear: () => void;
};

type Props = {
  baseUrl: string;
  alt?: string;
  onMarksChange?: (has: boolean) => void;
  // Fired after each stroke with the accumulated painted bounds, so a review composer
  // can anchor its note popover without polling the handle.
  onStrokeEnd?: (bounds: RegionBounds | null) => void;
  hintText?: string;
  // Rendered INSIDE the aspect-ratio box that hugs the image — pins and the note card
  // position in fractions of the picture, so they must not sit in an outer wrapper
  // that also contains the tool rail.
  overlay?: React.ReactNode;
};

// Brush is measured in the base image's NATURAL pixels (the buffer is full-res), so the range is
// large and the step coarse — a short vertical slider covers it in a few notches.
const MIN_BRUSH = 8;
const MAX_BRUSH = 256;
const BRUSH_STEP = 16;
const DEFAULT_BRUSH = 48;

export const ReviewAnnotationCanvas = forwardRef<AnnotationHandle, Props>(
  function ReviewAnnotationCanvas(
    {
      baseUrl,
      alt,
      onMarksChange,
      onStrokeEnd,
      hintText = "Paint over the area you want to change.",
      overlay,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dirtyRef = useRef(false);
    // Accumulated over every stroke since the last clear, in the buffer's NATURAL pixels.
    const strokeBoundsRef = useRef<{
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    } | null>(null);
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
      setDims((prev) =>
        prev && prev.w === w && prev.h === h ? prev : { w, h }
      );
    }, []);
    // Callback ref catches the already-cached case (a cached <img> may never fire onLoad); the
    // onLoad handler catches a fresh network load.
    const baseImgRef = useCallback(
      (img: HTMLImageElement | null) => {
        if (img?.complete) readDims(img);
      },
      [readDims]
    );
    const handleBaseLoad = useCallback(
      (e: React.SyntheticEvent<HTMLImageElement>) => readDims(e.currentTarget),
      [readDims]
    );

    // Init the transparent buffer once the canvas element + dims exist.
    const setCanvasRef = useCallback(
      (el: HTMLCanvasElement | null) => {
        canvasRef.current = el;
        if (el && dims)
          initDrawingCanvas(el, dims.w, dims.h, { transparent: true });
      },
      [dims]
    );

    // Client coords -> natural-pixel coords, folded into the running bounding box. The
    // canvas is CSS-scaled, so the rect ratio is the only correct conversion.
    const trackBounds = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const el = canvasRef.current;
        if (!el || !dims) return;
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * dims.w;
        const y = ((e.clientY - rect.top) / rect.height) * dims.h;
        const b = strokeBoundsRef.current ?? { minX: x, minY: y, maxX: x, maxY: y };
        strokeBoundsRef.current = {
          minX: Math.min(b.minX, x),
          minY: Math.min(b.minY, y),
          maxX: Math.max(b.maxX, x),
          maxY: Math.max(b.maxY, y),
        };
      },
      [dims]
    );

    const boundsAsFractions = useCallback((): RegionBounds | null => {
      const b = strokeBoundsRef.current;
      if (!b || !dims) return null;
      // Pad by half the brush so the box hugs the painted edge, then clamp to [0,1].
      const pad = brushSize / 2;
      return {
        x: Math.max(0, (b.minX - pad) / dims.w),
        y: Math.max(0, (b.minY - pad) / dims.h),
        w: Math.min(1, (b.maxX - b.minX + brushSize) / dims.w),
        h: Math.min(1, (b.maxY - b.minY + brushSize) / dims.h),
      };
    }, [dims, brushSize]);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!dirtyRef.current) {
          dirtyRef.current = true;
          onMarksChange?.(true); // reactive flag so the prompt preview picks up the clause
        }
        trackBounds(e);
        onPointerDown(e);
      },
      [onPointerDown, onMarksChange, trackBounds]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        // Only while a button is held — a hover pass paints nothing, so it must not
        // stretch the box either.
        if (e.buttons > 0) trackBounds(e);
        onPointerMove(e);
      },
      [onPointerMove, trackBounds]
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        onPointerUp(e);
        onStrokeEnd?.(boundsAsFractions());
      },
      [onPointerUp, onStrokeEnd, boundsAsFractions]
    );

    const resetMarks = useCallback(() => {
      clear();
      dirtyRef.current = false;
      strokeBoundsRef.current = null;
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
          ctx.putImageData(
            new ImageData(
              new Uint8ClampedArray(mask.data),
              mask.width,
              mask.height
            ),
            0,
            0
          );
          const dataUrl = out.toDataURL("image/png");
          return { base64: dataUrl.split(",")[1] ?? "", mime: "image/png" };
        },
        // The painted overlay itself (purple strokes on transparency) — what gets stored
        // as mask_path. overlayToMaskRGBA converts it to the OpenAI mask at replay (D239).
        toOverlayBase64: () => {
          const overlay = canvasRef.current;
          if (!overlay || !dirtyRef.current) return null;
          return overlay.toDataURL("image/png").split(",")[1] ?? null;
        },
        getStrokeBounds: boundsAsFractions,
      }),
      [resetMarks, boundsAsFractions]
    );

    // A small preview dot for the current brush size, scaled from the (large, natural-pixel)
    // brush range into a legible display size.
    const previewPx = Math.max(4, Math.min(22, Math.round(brushSize / 12)));

    return (
      <div className="flex h-full min-h-0 gap-3">
        {/* Canvas area */}
        <div className="flex h-full min-h-0 flex-1 flex-col items-center">
          {/* The hint used to sit here as its own row, which made the painted image
              shorter than the same image in generate mode. It is an overlay now, so
              this box hands its full height to the picture. */}
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            {/* Wrapper matches the image aspect so the overlay lines up exactly — which
                is why the height is a MAX and not h-full: pinning the height while the
                width clamps at max-w-full breaks the aspect box, letterboxing the image
                inside its own frame and knocking the paint canvas out of registration. */}
            <div
              className="relative max-h-full max-w-full overflow-hidden rounded-xl border border-border bg-muted/20"
              style={
                dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined
              }
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
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={onPointerLeave}
                  className="nodrag absolute inset-0 size-full opacity-40"
                  style={{ cursor: "crosshair", touchAction: "none" }}
                />
              )}
              {/* pointer-events-none: this sits over the paintable canvas. */}
              <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/80 px-3 py-1.5 text-center text-xs text-muted-foreground backdrop-blur-sm">
                {hintText}
              </p>
              {overlay}
            </div>
          </div>
        </div>

        {/* Right rail — brush/eraser · brush size · clear */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-3 rounded-xl border border-border bg-card px-2 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setTool("pen")}
            className={cn(
              "size-8 rounded-md p-0 transition hover:bg-muted",
              tool === "pen" && "ring-2 ring-primary ring-offset-1"
            )}
            aria-label="Paint region"
          >
            <span
              className="size-4 rounded-full"
              style={{ backgroundColor: MASK_COLOR }}
            />
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => setTool("eraser")}
            className={cn(
              "size-8 rounded-md p-0 transition hover:bg-muted",
              tool === "eraser" && "ring-2 ring-primary ring-offset-1"
            )}
            aria-label="Eraser"
          >
            <Eraser className="size-4" strokeWidth={1.5} />
          </Button>

          {/* Brush size — vertical slider (fixed 200px) with a live preview dot */}
          <div className="flex flex-col items-center gap-2 py-1">
            <span
              className="shrink-0 rounded-full bg-foreground"
              style={{ width: previewPx, height: previewPx }}
              aria-hidden
            />
            <Slider
              orientation="vertical"
              min={MIN_BRUSH}
              max={MAX_BRUSH}
              step={BRUSH_STEP}
              value={[brushSize]}
              onValueChange={(v) => setBrushSize(Array.isArray(v) ? v[0] : v)}
              aria-label="Brush size"
              style={{ height: 200 }}
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={resetMarks}
            className="size-8 rounded-md p-0 text-destructive transition hover:bg-muted hover:text-destructive"
            aria-label="Clear annotation"
          >
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    );
  }
);
