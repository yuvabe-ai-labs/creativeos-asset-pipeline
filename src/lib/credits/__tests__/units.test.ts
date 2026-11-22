import { describe, it, expect } from "vitest";
import { usdToFinalCredits } from "../units";

describe("usdToFinalCredits", () => {
  it("converts USD to credits and rounds up to the nearest step", () => {
    // 0.005 USD * 1000 = 5 credits, already a multiple of 5 -> stays 5
    expect(usdToFinalCredits(0.005)).toBe(5);
  });

  it("rounds up even a tiny excess over a step boundary", () => {
    // 0.0051 USD * 1000 = 5.1 credits -> rounds up to 10, not down to 5
    expect(usdToFinalCredits(0.0051)).toBe(10);
  });

  it("leaves an already-clean multiple of the step unchanged", () => {
    // 0.24 USD * 1000 = 240 credits, already a multiple of 5
    expect(usdToFinalCredits(0.24)).toBe(240);
  });

  it("handles a large video-scale cost", () => {
    // 2.13 USD * 1000 = 2130 credits, already a multiple of 5
    expect(usdToFinalCredits(2.13)).toBe(2130);
  });

  it("returns 0 for a zero cost", () => {
    expect(usdToFinalCredits(0)).toBe(0);
  });

  it("ignores float noise before rounding up to the step", () => {
    // 5 x 0.084 = 0.42000000000000004 in floating point: 420 credits, not 425
    expect(usdToFinalCredits(5 * 0.084)).toBe(420);
    // voice change 87.5 s at $0.002 a second = 0.17500000000000002: 175, not 180
    expect(usdToFinalCredits(87.5 * 0.002)).toBe(175);
  });

  it("still rounds a real excess of a millionth of a credit up", () => {
    expect(usdToFinalCredits(0.420001)).toBe(425);
  });
});
