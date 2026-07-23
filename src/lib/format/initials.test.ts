import { describe, it, expect } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(initials("Acme Studio")).toBe("AS");
  });

  it("handles a single word", () => {
    expect(initials("Acme")).toBe("A");
  });

  it("ignores extra whitespace and words beyond the first two", () => {
    expect(initials("  Acme   Creative   Studio  ")).toBe("AC");
  });

  it("returns an empty string for empty input", () => {
    expect(initials("")).toBe("");
  });
});
