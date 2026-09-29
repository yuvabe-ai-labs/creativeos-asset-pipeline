import { describe, it, expect } from "vitest";
import { readVoLines } from "../voiceover";

describe("readVoLines", () => {
  it("returns undefined for anything that is not an array", () => {
    expect(readVoLines(undefined)).toBeUndefined();
    expect(readVoLines("x")).toBeUndefined();
  });

  it("keeps well-formed lines and drops malformed ones", () => {
    expect(
      readVoLines([{ text: "Hi.", speaker: "narrator" }, { speaker: "narrator" }, null, { text: 3 }]),
    ).toEqual([{ text: "Hi.", speaker: "narrator" }]);
  });

  it("keeps an empty array as an empty array", () => {
    expect(readVoLines([])).toEqual([]);
  });
});
