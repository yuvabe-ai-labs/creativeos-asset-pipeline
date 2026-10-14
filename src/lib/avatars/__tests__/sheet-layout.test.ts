import { describe, it, expect } from "vitest";
import { stripLayout } from "../sheet-layout";

describe("stripLayout", () => {
  it("scales every view to one height and lays them left to right with a gap", () => {
    const four = Array.from({ length: 4 }, () => ({ width: 768, height: 1024 }));
    expect(stripLayout(four, 1024, 24)).toEqual({
      widths: [768, 768, 768, 768], lefts: [0, 792, 1584, 2376], width: 3144, height: 1024,
    });
  });

  it("keeps each view's own shape when the model returned a different size", () => {
    const layout = stripLayout([{ width: 896, height: 1200 }, { width: 768, height: 1024 }], 1024, 0);
    expect(layout.widths).toEqual([765, 768]);
    expect(layout.width).toBe(1533);
  });
});
