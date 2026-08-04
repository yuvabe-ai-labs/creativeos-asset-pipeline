import { describe, it, expect } from "vitest";
import { computeCoverCrop, computeContainRect, computeNaturalRatioReset } from "./image-fit";

describe("computeCoverCrop", () => {
  it("trims the top and bottom of a portrait image in a landscape box", () => {
    // 1000x2000 source, 400x200 box (2:1) -> keep full width, keep 500px of height, centred
    expect(computeCoverCrop(1000, 2000, 400, 200)).toEqual({
      x: 0, y: 750, width: 1000, height: 500,
    });
  });

  it("trims the left and right of a landscape image in a portrait box", () => {
    // 2000x1000 source, 200x400 box (1:2) -> keep full height, keep 500px of width, centred
    expect(computeCoverCrop(2000, 1000, 200, 400)).toEqual({
      x: 750, y: 0, width: 500, height: 1000,
    });
  });

  it("crops nothing when the aspect ratios already match", () => {
    expect(computeCoverCrop(1000, 1000, 300, 300)).toEqual({
      x: 0, y: 0, width: 1000, height: 1000,
    });
    expect(computeCoverCrop(1600, 900, 800, 450)).toEqual({
      x: 0, y: 0, width: 1600, height: 900,
    });
  });

  it("always returns a rect inside the source bounds", () => {
    const crop = computeCoverCrop(1080, 1350, 1200, 627);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1080);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1350);
    // and the kept region matches the box ratio
    expect(crop.width / crop.height).toBeCloseTo(1200 / 627, 6);
  });

  it("degrades safely on a not-yet-measured image", () => {
    expect(computeCoverCrop(0, 0, 400, 200)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("computeContainRect", () => {
  it("letterboxes a portrait image in a landscape box", () => {
    // 1000x2000 into 400x200 -> scale 0.1 -> 100x200, centred horizontally
    expect(computeContainRect(1000, 2000, 400, 200)).toEqual({
      x: 150, y: 0, width: 100, height: 200,
    });
  });

  it("pillarboxes a landscape image in a portrait box", () => {
    // 2000x1000 into 200x400 -> scale 0.1 -> 200x100, centred vertically
    expect(computeContainRect(2000, 1000, 200, 400)).toEqual({
      x: 0, y: 150, width: 200, height: 100,
    });
  });

  it("fills the box exactly when the aspect ratios match", () => {
    expect(computeContainRect(1000, 1000, 300, 300)).toEqual({
      x: 0, y: 0, width: 300, height: 300,
    });
  });

  it("degrades safely on a not-yet-measured image", () => {
    expect(computeContainRect(0, 0, 400, 200)).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });
});

describe("computeNaturalRatioReset", () => {
  it("recomputes height from width when width is the larger/dominant dimension", () => {
    // natural image is 2:1 (e.g. 1000x500); box is currently squashed to 0.4 wide, 0.4 tall (1:1)
    const box = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 };
    const result = computeNaturalRatioReset(box, 1000, 500);
    expect(result.w).toBeCloseTo(0.4, 5); // width (the larger current dimension) stays
    expect(result.h).toBeCloseTo(0.2, 5); // height recomputed: 0.4 * (500/1000)
  });

  it("recomputes width from height when height is the larger/dominant dimension", () => {
    // natural image is 1:2 (portrait, e.g. 500x1000); box is currently 0.4 x 0.4
    const box = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 };
    const result = computeNaturalRatioReset(box, 500, 1000);
    expect(result.h).toBeCloseTo(0.4, 5);
    expect(result.w).toBeCloseTo(0.2, 5);
  });

  it("keeps the box's CENTER point fixed, not its top-left corner", () => {
    const box = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 };
    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    const result = computeNaturalRatioReset(box, 1000, 500); // -> w:0.4, h:0.2
    expect(result.x + result.w / 2).toBeCloseTo(centerX, 5);
    expect(result.y + result.h / 2).toBeCloseTo(centerY, 5);
  });

  it("is a no-op (returns the same box) when the box already matches the natural ratio", () => {
    const box = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 }; // already 2:1
    const result = computeNaturalRatioReset(box, 1000, 500);
    expect(result.w).toBeCloseTo(0.4, 5);
    expect(result.h).toBeCloseTo(0.2, 5);
    expect(result.x).toBeCloseTo(0.2, 5);
    expect(result.y).toBeCloseTo(0.2, 5);
  });
});
