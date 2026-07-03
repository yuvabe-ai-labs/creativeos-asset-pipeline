import { describe, it, expect } from "vitest";
import { normalizeTitle, MAX_TITLE_LENGTH } from "./title";

describe("normalizeTitle", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTitle("  Hero shot  ")).toBe("Hero shot");
  });

  it("collapses internal whitespace, newlines, and tabs to single spaces", () => {
    expect(normalizeTitle("Hero\n\nshot\t\tB")).toBe("Hero shot B");
  });

  it("normalizes blank input to an empty string", () => {
    expect(normalizeTitle("   \n\t ")).toBe("");
    expect(normalizeTitle("")).toBe("");
  });

  it("leaves an already-clean title unchanged", () => {
    expect(normalizeTitle("Image prompt")).toBe("Image prompt");
  });

  it("caps length at MAX_TITLE_LENGTH with no trailing space", () => {
    const out = normalizeTitle("a ".repeat(200));
    expect(out.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(out).toBe(out.trim());
  });
});
