import { describe, it, expect } from "vitest";
import { extractHexes } from "./brand-colours";

describe("extractHexes", () => {
  it("pulls a 6-digit hex out of a prose colour name", () => {
    expect(extractHexes(["turmeric gold #C8A000"])).toEqual(["#c8a000"]);
  });

  it("lowercases, so swatches compare equal to stored layer colours", () => {
    expect(extractHexes(["#FFCA2D"])).toEqual(["#ffca2d"]);
  });

  it("expands 3-digit shorthand to 6 digits", () => {
    expect(extractHexes(["#FFF", "#0a0"])).toEqual(["#ffffff", "#00aa00"]);
  });

  it("skips entries with no hex at all — a swatch needs a real value", () => {
    expect(extractHexes(["off-white", "warm neutral"])).toEqual([]);
  });

  it("keeps the KB's ordering, which is primary-first and meaningful", () => {
    expect(extractHexes(["#111111", "#222222", "#333333"]))
      .toEqual(["#111111", "#222222", "#333333"]);
  });

  it("dedupes, including across casing and shorthand", () => {
    expect(extractHexes(["#FFF", "#ffffff", "white #FFF"])).toEqual(["#ffffff"]);
  });

  it("takes only the first hex when one entry names several", () => {
    // A single palette entry describes ONE colour; a second code in the same string is
    // commentary ("gold #C8A000, close to #C9A100"), not another palette member.
    expect(extractHexes(["gold #C8A000 close to #C9A100"])).toEqual(["#c8a000"]);
  });

  it("ignores a malformed length between the two valid ones", () => {
    expect(extractHexes(["#12345"])).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(extractHexes([])).toEqual([]);
  });
});
