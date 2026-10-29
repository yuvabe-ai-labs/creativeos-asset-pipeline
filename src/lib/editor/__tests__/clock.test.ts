import { describe, expect, it } from "vitest";
import { advanceClock } from "../clock";

// A 4 s piece starting at reel 10 s, its source in point at 2 s; the reel is 20 s long.
const base = { offset: 10, length: 4, local: 1, sourceIn: 2, total: 20, fps: 24 };

describe("advanceClock (D402)", () => {
  it("follows the file inside a piece, never going backwards", () => {
    expect(advanceClock({ ...base, fileTime: 3.5, ended: false })).toEqual({ time: 11.5, crossed: false, done: false });
    expect(advanceClock({ ...base, fileTime: 2.5, ended: false }).time).toBe(11);
  });

  it("holds while the media isn't ready", () => {
    expect(advanceClock({ ...base, fileTime: null, ended: false })).toEqual({ time: 11, crossed: false, done: false });
  });

  it("crosses into the next piece at the cut, or when the file ended", () => {
    expect(advanceClock({ ...base, fileTime: 5.99, ended: false })).toEqual({ time: 14, crossed: true, done: false });
    expect(advanceClock({ ...base, fileTime: 4, ended: true })).toEqual({ time: 14, crossed: true, done: false });
  });

  it("is done at the end of the reel", () => {
    expect(advanceClock({ ...base, offset: 16, fileTime: 6, ended: false })).toEqual({ time: 20, crossed: true, done: true });
  });
});
