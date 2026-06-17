import { describe, it, expect } from "vitest";
import { drawingContextSettings, PEN_WIDTH, ERASER_WIDTH } from "./draw-canvas";

describe("drawingContextSettings", () => {
  it("pen draws the given colour with source-over at the pen width", () => {
    expect(drawingContextSettings("pen", "#16a34a")).toEqual({
      globalCompositeOperation: "source-over",
      strokeStyle: "#16a34a",
      lineWidth: PEN_WIDTH,
    });
  });

  it("eraser paints white with source-over at the eraser width", () => {
    expect(drawingContextSettings("eraser", "#dc2626")).toEqual({
      globalCompositeOperation: "source-over",
      strokeStyle: "#ffffff",
      lineWidth: ERASER_WIDTH,
    });
  });

  it("eraser is much wider than the pen", () => {
    expect(ERASER_WIDTH).toBeGreaterThan(PEN_WIDTH * 4);
  });
});
