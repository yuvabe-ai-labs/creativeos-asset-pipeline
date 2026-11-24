import { describe, expect, it } from "vitest";
import { newItemIds } from "./new-items";

// D530: a reference the copilot's fetch brings in lands highlighted once; nothing on first load.

describe("newItemIds", () => {
  it("is empty on the first load", () => {
    expect(newItemIds(null, ["a"])).toEqual(new Set());
  });
  it("is the ids that appeared since the last load", () => {
    expect(newItemIds(new Set(["a"]), ["a", "b"])).toEqual(new Set(["b"]));
  });
  it("is empty when only something was removed", () => {
    expect(newItemIds(new Set(["a", "b"]), ["a"])).toEqual(new Set());
  });
});
