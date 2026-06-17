// Pure drawing-tool logic for the Draw node, isolated from the canvas/DOM so it can be
// unit-tested. The useDrawingCanvas hook applies these settings to the 2D context before
// each stroke. v1 canvas is a single white-background layer, so the eraser is simply a
// white pen (no destination-out — that would punch transparent holes into the export).

export type DrawTool = "pen" | "eraser";

export type CanvasToolSettings = {
  globalCompositeOperation: "source-over" | "destination-out";
  strokeStyle: string;
};

export function drawingContextSettings(
  tool: DrawTool,
  color: string,
): CanvasToolSettings {
  if (tool === "eraser") {
    return { globalCompositeOperation: "source-over", strokeStyle: "#ffffff" };
  }
  return { globalCompositeOperation: "source-over", strokeStyle: color };
}
