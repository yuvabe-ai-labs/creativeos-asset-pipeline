import { describe, it, expect } from "vitest";
import { groupByTimecode } from "../group";

describe("groupByTimecode", () => {
  it("groups items under their timecode, ascending, preserving item order", () => {
    const out = groupByTimecode([
      { timecodeMs: 4000, note: "b" },
      { timecodeMs: 1000, note: "a" },
      { timecodeMs: 4000, note: "c" },
    ]);
    expect(out.map((g) => g.timecodeMs)).toEqual([1000, 4000]);
    expect(out[1].items.map((i) => i.note)).toEqual(["b", "c"]);
  });

  it("puts null timecodes (images) into a single leading group", () => {
    const out = groupByTimecode([
      { timecodeMs: 2000, note: "b" },
      { timecodeMs: null, note: "a" },
    ]);
    expect(out.map((g) => g.timecodeMs)).toEqual([null, 2000]);
  });

  it("returns empty for empty input", () => {
    expect(groupByTimecode([])).toEqual([]);
  });
});
