import { describe, it, expect } from "vitest";
import { boundingBoxOf, alignLayers, type AlignMode } from "./align";
import { createTextLayer } from "./layers";

describe("boundingBoxOf", () => {
  it("computes the combined bounding box of several layers", () => {
    const a = createTextLayer({ x: 0.1, y: 0.2, w: 0.2, h: 0.1 });
    const b = createTextLayer({ x: 0.5, y: 0.1, w: 0.1, h: 0.3 });
    const box = boundingBoxOf([a, b]);
    // toBeCloseTo per-field rather than toEqual: 0.2 + 0.1 lands on 0.30000000000000004 in
    // floating point, so h's exact value depends on subtraction order — not a bug in the box math.
    expect(box.x).toBeCloseTo(0.1, 5);
    expect(box.y).toBeCloseTo(0.1, 5);
    expect(box.w).toBeCloseTo(0.5, 5);
    expect(box.h).toBeCloseTo(0.3, 5);
  });
});

describe("alignLayers", () => {
  const canvas = { x: 0, y: 0, w: 1, h: 1 };

  it("with a single selected layer, aligns to the CANVAS", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3, w: 0.2, h: 0.1 });
    const result = alignLayers([a], [a.id], "left");
    expect(result[0].x).toBeCloseTo(canvas.x, 5);
    expect(result[0].y).toBe(a.y); // unaffected axis unchanged
  });

  it("'center-h' centers horizontally within the target box", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3, w: 0.2, h: 0.1 });
    const result = alignLayers([a], [a.id], "center-h");
    expect(result[0].x).toBeCloseTo(0.4, 5); // (1 - 0.2) / 2
  });

  it("'right' aligns the layer's right edge to the target box's right edge", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3, w: 0.2, h: 0.1 });
    const result = alignLayers([a], [a.id], "right");
    expect(result[0].x).toBeCloseTo(0.8, 5); // 1 - 0.2
  });

  it("'top' / 'center-v' / 'bottom' behave the same on the y axis", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3, w: 0.2, h: 0.4 });
    expect(alignLayers([a], [a.id], "top")[0].y).toBeCloseTo(0, 5);
    expect(alignLayers([a], [a.id], "center-v")[0].y).toBeCloseTo(0.3, 5); // (1-0.4)/2
    expect(alignLayers([a], [a.id], "bottom")[0].y).toBeCloseTo(0.6, 5); // 1-0.4
  });

  it("with 2+ selected layers, aligns to their COMBINED bounding box, not the canvas", () => {
    const a = createTextLayer({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }); // box: x in [0.1,0.6]
    const b = createTextLayer({ x: 0.5, y: 0.1, w: 0.1, h: 0.1 });
    const c = createTextLayer({ x: 0.6, y: 0.4, w: 0.1, h: 0.1 }); // extends box to x=0.7
    const result = alignLayers([a, b, c], [a.id, b.id, c.id], "left");
    // combined box x = 0.1 (min of a.x, b.x, c.x)
    const resA = result.find((l) => l.id === a.id)!;
    expect(resA.x).toBeCloseTo(0.1, 5);
  });

  it("only repositions the selected layers, leaves others untouched", () => {
    const a = createTextLayer({ x: 0.3, y: 0.3 });
    const b = createTextLayer({ x: 0.5, y: 0.5 });
    const result = alignLayers([a, b], [a.id], "left");
    const resB = result.find((l) => l.id === b.id)!;
    expect(resB.x).toBe(b.x);
    expect(resB.y).toBe(b.y);
  });

  it("is a no-op for an empty selection", () => {
    const a = createTextLayer();
    expect(alignLayers([a], [], "left")).toEqual([a]);
  });
});
