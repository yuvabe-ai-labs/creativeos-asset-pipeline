// Pure drawing-tool logic for the Draw node, isolated from the canvas/DOM so it can be
// unit-tested. The useDrawingCanvas hook applies these settings to the 2D context before
// each stroke. v1 canvas is a single white-background layer, so the eraser is simply a
// white pen (no destination-out — that would punch transparent holes into the export).

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
): CanvasToolSettings {
  if (tool === "eraser") {
    return {
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
