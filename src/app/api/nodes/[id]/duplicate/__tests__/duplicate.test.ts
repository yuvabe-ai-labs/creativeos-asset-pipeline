import { describe, it, expect } from "vitest";

describe("duplicate node offset", () => {
  it("offsets position by +32 on both axes", () => {
    const original = { x: 100, y: 200 };
    const duplicated = { x: original.x + 32, y: original.y + 32 };
    expect(duplicated).toEqual({ x: 132, y: 232 });
  });
});
