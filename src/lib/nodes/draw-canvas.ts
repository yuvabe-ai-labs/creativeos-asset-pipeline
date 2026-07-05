// Pure drawing-tool logic for the Draw node, isolated from the canvas/DOM so it can be
// unit-tested. The useDrawingCanvas hook applies these settings to the 2D context before
// each stroke. The Draw node's canvas is a single white-background layer, so its eraser is a
// white pen (destination-out would punch transparent holes into the export). The image-edit
// annotation overlay is a TRANSPARENT layer (opts.transparent), where the eraser uses
// destination-out to clear ink without touching the base image beneath.

export type DrawTool = "pen" | "eraser";

// Stroke widths (in 720x1280 canvas pixels). The eraser is 10x the pen so it clears area
// fast — a pen-width eraser is fiddly on a rough storyboard sketch.
export const PEN_WIDTH = 4;
export const ERASER_WIDTH = 40;

export type CanvasToolSettings = {
  globalCompositeOperation: "source-over" | "destination-out";
  strokeStyle: string;
  lineWidth: number;
};

export function drawingContextSettings(
  tool: DrawTool,
  color: string,
  opts?: { transparent?: boolean },
): CanvasToolSettings {
  if (tool === "eraser") {
    // On a transparent overlay (the annotation layer) the eraser must CLEAR ink to
    // transparent — a white pen would paint white marks over the base image. On the
    // white-background Draw node it stays a white pen (destination-out would punch holes).
    return opts?.transparent
      ? {
          globalCompositeOperation: "destination-out",
          strokeStyle: "rgba(0,0,0,1)",
          lineWidth: ERASER_WIDTH,
        }
      : {
          globalCompositeOperation: "source-over",
          strokeStyle: "#ffffff",
          lineWidth: ERASER_WIDTH,
        };
  }
  return {
    globalCompositeOperation: "source-over",
    strokeStyle: color,
    lineWidth: PEN_WIDTH,
  };
}
