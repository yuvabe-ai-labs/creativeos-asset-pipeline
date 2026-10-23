import { describe, it, expect } from "vitest";
import { gapCuts, viewCanvas } from "../sheet-layout";

/** A texture profile: 0 for smooth backdrop, 1 where a figure is, over `width` columns. */
const profile = (width: number, figures: [number, number][]) =>
  Array.from({ length: width }, (_, x) => (figures.some(([a, b]) => x >= a && x < b) ? 1 : 0));

const inGap = (cut: number, [a, b]: [number, number]) => cut >= a && cut <= b;

describe("gapCuts (D395)", () => {
  it("cuts at the middle of each gap between the four figures", () => {
    const cuts = gapCuts(profile(400, [[20, 80], [120, 180], [220, 280], [320, 380]]));
    expect(cuts).toEqual([[0, 100], [100, 200], [200, 300], [300, 400]]);
  });

  it("follows figures that do not sit on the quarters", () => {
    const cuts = gapCuts(profile(400, [[10, 60], [90, 150], [230, 290], [330, 390]]));
    expect(cuts).toEqual([[0, 75], [75, 190], [190, 310], [310, 400]]);
  });

  it("finds a narrow gap between wide figures, which a colour match merged (Radha, 22 Oct 2026)", () => {
    const figures: [number, number][] = [[30, 137], [165, 235], [269, 332], [367, 480]];
    const [[, a], [, b], [, c]] = gapCuts(profile(512, figures));
    expect(inGap(a, [137, 165])).toBe(true);
    expect(inGap(b, [235, 269])).toBe(true);
    expect(inGap(c, [332, 367])).toBe(true);
  });

  it("cuts in the wider side of a gap a speck splits, never through a figure", () => {
    const [[, a]] = gapCuts(profile(400, [[20, 80], [98, 100], [120, 180], [220, 280], [320, 380]]));
    expect(inGap(a, [100, 120])).toBe(true);
  });

  it("is not thrown by a figure detail outside the cut windows", () => {
    // A hairline gap inside the first figure, between its legs, lies left of every window.
    const cuts = gapCuts(profile(400, [[20, 48], [50, 80], [120, 180], [220, 280], [320, 380]]));
    expect(cuts).toEqual([[0, 100], [100, 200], [200, 300], [300, 400]]);
  });

  it("falls back to equal quarters when there is no gap to find", () => {
    expect(gapCuts(profile(400, [[0, 400]]))).toEqual([[0, 100], [100, 200], [200, 300], [300, 400]]);
    expect(gapCuts(profile(401, []))).toEqual([[0, 100], [100, 200], [200, 300], [300, 401]]);
  });
});

describe("viewCanvas", () => {
  it("pads a tall narrow cut out to the views' 3:4 shape, centred", () => {
    expect(viewCanvas(300, 900)).toEqual({ width: 675, height: 900, left: 188, top: 0 });
  });

  it("pads a wide cut downwards and upwards instead", () => {
    expect(viewCanvas(900, 900)).toEqual({ width: 900, height: 1200, left: 0, top: 150 });
  });
});
