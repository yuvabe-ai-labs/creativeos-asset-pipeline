import { describe, it, expect } from "vitest";
import {
  normalizedToPx,
  pxToNormalized,
  fontSizeToPx,
  pxToFontSize,
  displayFontSize,
  fontSizeFromDisplay,
} from "./units";
import { POST_FORMATS } from "./formats";

describe("normalizedToPx / pxToNormalized", () => {
  it("converts a normalized value to pixels for a container size", () => {
    expect(normalizedToPx(0.5, 1000)).toBe(500);
    expect(normalizedToPx(0.1, 1080)).toBeCloseTo(108, 5);
  });

  it("round-trips at every format width/height", () => {
    for (const spec of Object.values(POST_FORMATS)) {
      for (const value of [0, 0.1, 0.333, 0.75, 1]) {
        const px = normalizedToPx(value, spec.width);
        expect(pxToNormalized(px, spec.width)).toBeCloseTo(value, 6);
      }
    }
  });

  it("pxToNormalized is 0 for a zero-size container (no divide-by-zero NaN)", () => {
    expect(pxToNormalized(50, 0)).toBe(0);
  });
});

describe("fontSizeToPx / pxToFontSize", () => {
  it("measures against the shorter edge, so square is unchanged", () => {
    // 1080x1080: min == height, identical to the old height-based behaviour.
    expect(fontSizeToPx(0.05, 1080, 1080)).toBeCloseTo(54, 5);
  });

  it("uses width when the canvas is taller than it is wide", () => {
    // 1080x1920 story: the old height basis gave 96px; the shorter edge gives 54px,
    // so the same copy reads the same size as it does on a square.
    expect(fontSizeToPx(0.05, 1080, 1920)).toBeCloseTo(54, 5);
  });

  it("uses height when the canvas is wider than it is tall", () => {
    // 1600x900 X post.
    expect(fontSizeToPx(0.05, 1600, 900)).toBeCloseTo(45, 5);
  });

  it("round-trips through pxToFontSize at any ratio", () => {
    expect(pxToFontSize(fontSizeToPx(0.05, 1080, 1920), 1080, 1920)).toBeCloseTo(0.05, 6);
    expect(pxToFontSize(fontSizeToPx(0.05, 1600, 900), 1600, 900)).toBeCloseTo(0.05, 6);
  });

  it("returns 0 rather than dividing by zero on an unmeasured canvas", () => {
    expect(pxToFontSize(10, 0, 0)).toBe(0);
  });
});

describe("display font size (1080px baseline)", () => {
  it("shows a normalized fontSize as a legible display number", () => {
    expect(displayFontSize(0.0463)).toBe(50); // 0.0463 * 1080 rounds to 50
  });

  it("round-trips through fontSizeFromDisplay", () => {
    const normalized = fontSizeFromDisplay(48);
    expect(displayFontSize(normalized)).toBe(48);
  });
});
