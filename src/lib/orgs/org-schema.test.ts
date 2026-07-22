import { describe, it, expect } from "vitest";
import { parseCreditLimit } from "./org-schema";

describe("parseCreditLimit", () => {
  it("returns null for empty / whitespace (unlimited)", () => {
    expect(parseCreditLimit("")).toBeNull();
    expect(parseCreditLimit("   ")).toBeNull();
  });
  it("parses a positive number", () => {
    expect(parseCreditLimit("1000")).toBe(1000);
    expect(parseCreditLimit("49.5")).toBe(49.5);
  });
  it("parses zero as a valid limit (not unlimited)", () => {
    expect(parseCreditLimit("0")).toBe(0);
  });
  it("throws on a negative value", () => {
    expect(() => parseCreditLimit("-5")).toThrow();
  });
  it("throws on a non-numeric value", () => {
    expect(() => parseCreditLimit("abc")).toThrow();
  });
});
