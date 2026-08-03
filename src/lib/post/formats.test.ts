import { describe, it, expect } from "vitest";
import { POST_FORMATS, getFormatSpec } from "./formats";

describe("POST_FORMATS", () => {
  it("declares all four V1 formats", () => {
    expect(Object.keys(POST_FORMATS).sort()).toEqual(
      ["a4-print", "ig-square", "ig-story", "linkedin"].sort(),
    );
  });

  it("ig-square is a 1:1 square", () => {
    const spec = getFormatSpec("ig-square");
    expect(spec.width).toBe(1080);
    expect(spec.height).toBe(1080);
  });

  it("ig-story is 9:16", () => {
    const spec = getFormatSpec("ig-story");
    expect(spec.width / spec.height).toBeCloseTo(9 / 16, 4);
  });

  it("a4-print is 300 DPI and only format with a dpi field", () => {
    const a4 = getFormatSpec("a4-print");
    expect(a4.dpi).toBe(300);
    expect(a4.width).toBe(2480);
    expect(a4.height).toBe(3508);
    expect(getFormatSpec("ig-square").dpi).toBeUndefined();
  });

  it("every format has a human label", () => {
    for (const key of Object.keys(POST_FORMATS) as (keyof typeof POST_FORMATS)[]) {
      expect(POST_FORMATS[key].label.length).toBeGreaterThan(0);
    }
  });
});
