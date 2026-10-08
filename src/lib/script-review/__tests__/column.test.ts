// src/lib/script-review/__tests__/column.test.ts
import { describe, it, expect } from "vitest";
import { columnGroups, threadCount } from "../column";
import { buildThreads, placeThreads } from "../threads";
import { comment, reelDoc } from "./fixtures";

const doc = reelDoc();
const placed = placeThreads(
  buildThreads([
    comment({ id: "a", part: { kind: "shot", shotId: "s04" } }),
    comment({ id: "b", part: { kind: "context" }, createdAt: "2026-10-10T10:05:00.000Z" }),
    comment({ id: "c", part: { kind: "shot", shotId: "s04" }, createdAt: "2026-10-10T10:06:00.000Z" }),
  ]),
  doc,
  {},
);

describe("columnGroups", () => {
  it("groups threads by part, in page order, each labelled", () => {
    const groups = columnGroups(placed, doc, null);
    expect(groups.map((g) => [g.label, g.threads.length])).toEqual([["Context", 1], ["S4", 2]]);
  });

  it("includes the part a marker opened even before it has a thread, in its place", () => {
    const groups = columnGroups(placed, doc, { kind: "cast", castId: "meenakshi" });
    expect(groups.map((g) => g.label)).toEqual(["Context", "Meenakshi", "S4"]);
    expect(groups[1].threads).toEqual([]);
  });

  it("never lists a part twice", () => {
    expect(columnGroups(placed, doc, { kind: "shot", shotId: "s04" })).toHaveLength(2);
  });
});

describe("threadCount", () => {
  it("counts every thread, those on removed shots included", () => {
    const gone = reelDoc();
    gone.shots = gone.shots.filter((s) => s.id !== "s04");
    expect(threadCount(placed)).toBe(3);
    expect(threadCount(placeThreads(buildThreads([comment({ part: { kind: "shot", shotId: "s04" } })]), gone, {}))).toBe(1);
  });
});
