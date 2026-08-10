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

  it("renders a small stage ABOVE 1:1, because Konva re-rasterises rather than upscales", () => {
    // A post is authored at 1080px; a 240px stage is a downscaled view of it, so asking for
    // more pixels recovers detail that really exists rather than inventing any.
    expect(thumbnailPixelRatio(240, 300, 480)).toBeCloseTo(1.6, 6);
  });

  it("holds the ratio at 2 so a tiny stage can't demand an enormous canvas", () => {
    expect(thumbnailPixelRatio(60, 40, 480)).toBe(2);
    expect(thumbnailPixelRatio(10, 10, 480)).toBe(2);
  });

  it("targets a card-sized image on a real laptop artboard", () => {
    // 430x538 is what a 1080x1350 post measures on a laptop. The card is 224 CSS px, so on a
    // 2x display it needs ~448px — the first version targeted 200 and produced 160.
    const ratio = thumbnailPixelRatio(430, 538, 480);
    expect(Math.round(430 * ratio)).toBeGreaterThanOrEqual(384);
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
