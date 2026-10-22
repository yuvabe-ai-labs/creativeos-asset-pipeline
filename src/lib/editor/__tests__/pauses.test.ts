import { describe, expect, it } from "vitest";
import { pausesFromWords } from "../pauses";

describe("pausesFromWords (D409)", () => {
  it("finds the gaps of at least 0.6 s between words", () => {
    const words = [{ t: "a", s: 0, e: 0.5, p: 1 }, { t: "b", s: 0.6, e: 1 }, { t: "c", s: 1.8, e: 2 }, { t: "d", s: 2.5, e: 3 }].map((w) => ({ p: 1, ...w }));
    expect(pausesFromWords(words)).toEqual([[1, 1.8]]);
    expect(pausesFromWords(words, 0.4)).toEqual([[1, 1.8], [2, 2.5]]);
    expect(pausesFromWords([])).toEqual([]);
  });
});
