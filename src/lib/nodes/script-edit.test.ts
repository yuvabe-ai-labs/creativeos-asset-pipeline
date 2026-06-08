import { describe, it, expect } from "vitest";
import { setScriptValue, addItem, removeItem } from "./script-edit";

describe("setScriptValue", () => {
  it("sets a nested scalar and returns a new object (no mutation)", () => {
    const before = { a: { b: "old" } };
    const after = setScriptValue(before, ["a", "b"], "new");
    expect(after).toEqual({ a: { b: "new" } });
    expect(before.a.b).toBe("old"); // original untouched
    expect(after).not.toBe(before);
  });

  it("sets an array element by numeric index", () => {
    const before = { visual_script: { shots: [{ description: "one" }, { description: "two" }] } };
    const after = setScriptValue(before, ["visual_script", "shots", 1, "description"], "TWO");
    expect(after.visual_script.shots[1].description).toBe("TWO");
    expect(after.visual_script.shots[0].description).toBe("one");
    expect(Array.isArray(after.visual_script.shots)).toBe(true);
    expect(before.visual_script.shots[1].description).toBe("two"); // untouched
  });

  it("creates missing intermediate objects", () => {
    const after = setScriptValue({}, ["schedule", "date"], "Mon");
    expect(after).toEqual({ schedule: { date: "Mon" } });
  });
});

describe("addItem", () => {
  it("appends to an existing array", () => {
    const after = addItem({ qc_notes: ["a"] }, ["qc_notes"], "b");
    expect(after.qc_notes).toEqual(["a", "b"]);
  });
  it("creates the array when missing", () => {
    const after = addItem({}, ["qc_notes"], "first");
    expect(after).toEqual({ qc_notes: ["first"] });
  });
});

describe("removeItem", () => {
  it("removes the element at the given index", () => {
    const after = removeItem({ qc_notes: ["a", "b", "c"] }, ["qc_notes"], 1);
    expect(after.qc_notes).toEqual(["a", "c"]);
  });
  it("is a no-op for an out-of-range index", () => {
    const after = removeItem({ qc_notes: ["a"] }, ["qc_notes"], 5);
    expect(after.qc_notes).toEqual(["a"]);
  });
});
