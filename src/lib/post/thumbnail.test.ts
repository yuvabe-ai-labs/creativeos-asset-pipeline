import { describe, it, expect } from "vitest";
import { thumbnailPixelRatio, THUMBNAIL_MAX_PX } from "./thumbnail";

describe("thumbnailPixelRatio", () => {
  it("fits a portrait stage's long edge to the target", () => {
    // 430x538 is what a 1080x1350 post measures on a laptop-sized artboard.
    const ratio = thumbnailPixelRatio(430, 538, 200);
    expect(538 * ratio).toBeCloseTo(200, 6);
    expect(430 * ratio).toBeLessThan(200);
  });

  it("fits a landscape stage by its width instead", () => {
    const ratio = thumbnailPixelRatio(640, 360, 200);
    expect(640 * ratio).toBeCloseTo(200, 6);
    expect(360 * ratio).toBeLessThan(200);
  });

  it("never upscales a stage already smaller than the target", () => {
    // Re-encoding a 120px stage at 200px buys no detail and costs bytes.
    expect(thumbnailPixelRatio(120, 90, 200)).toBe(1);
    expect(thumbnailPixelRatio(200, 200, 200)).toBe(1);
  });

  it("returns 1 for an unmeasured stage rather than Infinity or NaN", () => {
    // A capture attempted before layout would otherwise ask Konva for an infinitely large
    // canvas and take the tab down with it.
    expect(thumbnailPixelRatio(0, 0, 200)).toBe(1);
    expect(thumbnailPixelRatio(0, 500, 200)).toBeCloseTo(0.4, 6);
    expect(thumbnailPixelRatio(-10, -10, 200)).toBe(1);
    expect(thumbnailPixelRatio(Number.NaN, Number.NaN, 200)).toBe(1);
  });

  it("keeps the stage's aspect ratio at every size", () => {
    for (const [w, h] of [[430, 538], [640, 360], [1080, 1080], [1080, 1920]]) {
      const ratio = thumbnailPixelRatio(w, h, THUMBNAIL_MAX_PX);
      expect((w * ratio) / (h * ratio)).toBeCloseTo(w / h, 9);
    }
  });

  it("honours a caller-supplied maximum", () => {
    expect(1000 * thumbnailPixelRatio(1000, 500, 100)).toBeCloseTo(100, 6);
  });
});
