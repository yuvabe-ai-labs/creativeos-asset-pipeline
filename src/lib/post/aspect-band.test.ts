import { describe, it, expect } from "vitest";
import { aspectBand, byBand } from "./aspect-band";

describe("aspectBand", () => {
  it("classifies tall formats as portrait", () => {
    expect(aspectBand("ig-story")).toBe("portrait");     // 1080x1920
    expect(aspectBand("ig-portrait")).toBe("portrait");  // 1080x1350
    expect(aspectBand("pinterest-pin")).toBe("portrait");// 1000x1500
    expect(aspectBand("a4-print")).toBe("portrait");     // 2480x3508
  });

  it("classifies 1:1 as square", () => {
    expect(aspectBand("ig-square")).toBe("square");
    expect(aspectBand("linkedin-square")).toBe("square");
  });

  it("classifies wide formats as landscape", () => {
    expect(aspectBand("linkedin-post")).toBe("landscape"); // 1200x627
    expect(aspectBand("x-post")).toBe("landscape");        // 1600x900
    expect(aspectBand("youtube-thumb")).toBe("landscape"); // 1280x720
  });

  it("treats near-square 4:5 as portrait, not square", () => {
    // 0.8 is meaningfully taller than wide; a square-tuned layout would waste the extra height.
    expect(aspectBand("facebook-post")).toBe("portrait"); // 1200x1500 = 0.8
  });
});

describe("byBand", () => {
  it("selects the value for the given band", () => {
    const values = { portrait: 1, square: 2, landscape: 3 };
    expect(byBand("portrait", values)).toBe(1);
    expect(byBand("square", values)).toBe(2);
    expect(byBand("landscape", values)).toBe(3);
  });
});
