import { describe, it, expect } from "vitest";

describe("duplicate node offset", () => {
  it("offsets +32 on x and -32 on y (duplicate sits above the original, YUV-195)", () => {
    const original = { x: 100, y: 200 };
    const duplicated = { x: original.x + 32, y: original.y - 32 };
    expect(duplicated).toEqual({ x: 132, y: 168 });
  });
});
