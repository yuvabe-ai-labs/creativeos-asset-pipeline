import { describe, it, expect } from "vitest";
import { durationOfParams } from "../record";

describe("durationOfParams", () => {
  it("prefers durationSeconds, then duration, then seconds", () => {
    expect(durationOfParams({ durationSeconds: 8, duration: 99, seconds: 99 })).toBe(8);
    expect(durationOfParams({ duration: 6, seconds: 99 })).toBe(6);
    expect(durationOfParams({ seconds: 4 })).toBe(4);
  });

  it("is 0 for missing, non-finite, or non-positive values", () => {
    expect(durationOfParams({})).toBe(0);
    expect(durationOfParams({ durationSeconds: 0 })).toBe(0);
    expect(durationOfParams({ durationSeconds: -3 })).toBe(0);
    expect(durationOfParams({ durationSeconds: "eight" })).toBe(0);
    expect(durationOfParams({ durationSeconds: NaN })).toBe(0);
  });
});
