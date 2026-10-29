import { describe, expect, it } from "vitest";
import { clampZoom, fitZoom, followScroll, MAX_ZOOM, MIN_ZOOM, reorderIndex, rulerStep, snapTarget, zoomAround } from "../timeline-view";

describe("zoom", () => {
  it("clamps and fits the reel into the view", () => {
    expect(clampZoom(1)).toBe(MIN_ZOOM);
    expect(clampZoom(999)).toBe(MAX_ZOOM);
    expect(fitZoom(1000, 29, 40)).toBeCloseTo(960 / 29, 9);
    expect(fitZoom(1000, 0)).toBe(60);
  });

  it("keeps the playhead at the same place on screen while zooming", () => {
    // at 60 px/s, t = 10 s sits at x 600; scrolled 400 → 200 px into the view
    expect(zoomAround(60, 120, 10, 400)).toBe(1000); // 1200 − 200
    expect(zoomAround(60, 30, 10, 400)).toBe(100);
    expect(zoomAround(60, 20, 1, 0)).toBe(0); // never negative
  });

  it("pages to the playhead when it leaves the view, else stays", () => {
    expect(followScroll(5, 60, 0, 800)).toBeNull(); // x 300, visible
    expect(followScroll(14, 60, 0, 800)).toBe(780); // x 840, past the right edge → page so it sits 60 px in
    expect(followScroll(2, 60, 400, 800)).toBe(60); // x 120, left of the view
  });
});

describe("snapTarget", () => {
  it("snaps within 8 px of a target and not beyond", () => {
    expect(snapTarget(10.1, [5, 10, 20], 60)).toBe(10); // 6 px away
    expect(snapTarget(10.2, [5, 10, 20], 60)).toBeNull(); // 12 px away
    expect(snapTarget(10.04, [10.05, 10], 60)).toBe(10.05); // the nearest wins
  });
});

describe("reorderIndex", () => {
  const pieces = [{ in: 0, out: 4 }, { in: 0, out: 2 }, { in: 1, out: 5 }]; // reel: 0–4, 4–6, 6–10
  it("drops before the first piece whose middle is right of the pointer", () => {
    expect(reorderIndex(1, pieces)).toBe(0);
    expect(reorderIndex(3, pieces)).toBe(1);
    expect(reorderIndex(5.5, pieces)).toBe(2);
    expect(reorderIndex(9, pieces)).toBe(3);
  });
});

describe("rulerStep", () => {
  it("labels less often as you zoom out", () => {
    expect(rulerStep(200)).toEqual({ minor: 0.5, major: 1 });
    expect(rulerStep(60)).toEqual({ minor: 1, major: 2 });
    expect(rulerStep(15)).toEqual({ minor: 5, major: 10 });
  });
});
