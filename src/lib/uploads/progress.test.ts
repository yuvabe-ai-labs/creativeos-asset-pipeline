import { describe, it, expect } from "vitest";
import { toUploadPercent } from "./progress";

describe("toUploadPercent", () => {
  it("rounds down to a whole percent, so 100 only shows when every byte is sent", () => {
    expect(toUploadPercent(421, 1000)).toBe(42);
    expect(toUploadPercent(999, 1000)).toBe(99);
    expect(toUploadPercent(1000, 1000)).toBe(100);
  });

  it("is 0 when the total is unknown or zero", () => {
    expect(toUploadPercent(500, 0)).toBe(0);
    expect(toUploadPercent(500, Number.NaN)).toBe(0);
  });

  it("clamps to 0..100", () => {
    expect(toUploadPercent(-5, 100)).toBe(0);
    expect(toUploadPercent(150, 100)).toBe(100);
  });
});
