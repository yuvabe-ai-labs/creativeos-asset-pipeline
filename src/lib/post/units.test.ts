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
  it("scales fontSize against the container HEIGHT, not width", () => {
    expect(fontSizeToPx(0.05, 1080)).toBeCloseTo(54, 5);
  });

  it("round-trips", () => {
    expect(pxToFontSize(fontSizeToPx(0.05, 1920), 1920)).toBeCloseTo(0.05, 6);
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
