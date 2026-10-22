import { describe, it, expect } from "vitest";
import { figureCuts, viewCanvas } from "../sheet-layout";

/** A column profile: 0 for background, 1 where a figure is, over `width` columns. */
const profile = (width: number, figures: [number, number][]) =>
  Array.from({ length: width }, (_, x) => (figures.some(([a, b]) => x >= a && x < b) ? 1 : 0));

describe("figureCuts (D395)", () => {
  it("cuts at the middle of each gap between the four figures", () => {
    const cuts = figureCuts(profile(400, [[20, 80], [120, 180], [220, 280], [320, 380]]));
    expect(cuts).toEqual([[0, 100], [100, 200], [200, 300], [300, 400]]);
  });

  it("follows figures that do not sit on the quarters", () => {
    const cuts = figureCuts(profile(400, [[10, 60], [90, 150], [230, 290], [330, 390]]));
    expect(cuts).toEqual([[0, 75], [75, 190], [190, 310], [310, 400]]);
  });

  it("treats a hairline gap inside one figure (between the legs, say) as the same figure", () => {
    const cuts = figureCuts(profile(400, [[20, 48], [50, 80], [120, 180], [220, 280], [320, 380]]));
    expect(cuts).toEqual([[0, 100], [100, 200], [200, 300], [300, 400]]);
  });

  it("ignores a speck narrower than a figure could be", () => {
    const cuts = figureCuts(profile(400, [[20, 80], [98, 100], [120, 180], [220, 280], [320, 380]]));
    expect(cuts).toEqual([[0, 100], [100, 200], [200, 300], [300, 400]]);
  });

  it("falls back to equal quarters when the figures run together", () => {
    expect(figureCuts(profile(400, [[20, 380]]))).toEqual([[0, 100], [100, 200], [200, 300], [300, 400]]);
  });

  it("falls back to equal quarters on an empty image", () => {
    expect(figureCuts(profile(401, []))).toEqual([[0, 100], [100, 200], [200, 300], [300, 401]]);
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
