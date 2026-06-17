import { describe, it, expect } from "vitest";
import { drawingContextSettings } from "./draw-canvas";

describe("drawingContextSettings", () => {
  it("pen draws the given colour with source-over", () => {
    expect(drawingContextSettings("pen", "#16a34a")).toEqual({
      globalCompositeOperation: "source-over",
      strokeStyle: "#16a34a",
    });
  });

  it("eraser paints white with source-over (white bg, no transparent holes)", () => {
    expect(drawingContextSettings("eraser", "#dc2626")).toEqual({
      globalCompositeOperation: "source-over",
      strokeStyle: "#ffffff",
    });
  });
});
