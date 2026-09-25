import { describe, it, expect } from "vitest";
import { versionLabelsById } from "./version-labels";

describe("versionLabelsById", () => {
  it("numbers v1 = oldest, counting every version, whatever order they arrive in", () => {
    const labels = versionLabelsById([
      { id: "b", createdAt: "2026-09-25T11:00:00Z" },
      { id: "c", createdAt: "2026-09-25T12:00:00Z" },
      { id: "a", createdAt: "2026-09-25T10:00:00Z" },
    ]);
    expect(Object.fromEntries(labels)).toEqual({ a: "v1", b: "v2", c: "v3" });
  });

  it("is empty for no versions", () => {
    expect(versionLabelsById([]).size).toBe(0);
  });
});
