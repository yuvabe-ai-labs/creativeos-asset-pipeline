import { describe, it, expect } from "vitest";
import { filterAndSort, type ListAccessors } from "./filter-sort";

type Row = { name: string; ts: string | null };

const accessors: ListAccessors<Row> = {
  name: (r) => r.name,
  timestamp: (r) => r.ts,
};

const rows: Row[] = [
  { name: "Beta", ts: "2026-06-10T00:00:00Z" },
  { name: "alpha", ts: "2026-06-15T00:00:00Z" },
  { name: "Gamma", ts: null },
];

describe("filterAndSort", () => {
  it("returns all rows for an empty query", () => {
    expect(filterAndSort(rows, "", "recent", accessors)).toHaveLength(3);
  });

  it("filters by name, case-insensitively and partially", () => {
    const out = filterAndSort(rows, "AL", "recent", accessors);
    expect(out.map((r) => r.name)).toEqual(["alpha"]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterAndSort(rows, "  beta  ", "recent", accessors)).toHaveLength(1);
  });

  it("sorts by recency (newest first), nulls last", () => {
    const out = filterAndSort(rows, "", "recent", accessors);
    expect(out.map((r) => r.name)).toEqual(["alpha", "Beta", "Gamma"]);
  });

  it("sorts by name (A→Z, case-insensitive)", () => {
    const out = filterAndSort(rows, "", "name", accessors);
    expect(out.map((r) => r.name)).toEqual(["alpha", "Beta", "Gamma"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    filterAndSort(rows, "", "name", accessors);
    expect(rows).toEqual(copy);
  });
});
