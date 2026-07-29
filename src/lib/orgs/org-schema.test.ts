import { describe, it, expect } from "vitest";
import { parseCreditLimit, parseResetPassword } from "./org-schema";

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

describe("parseResetPassword", () => {
  it("returns null for empty / whitespace (auto-generate)", () => {
    expect(parseResetPassword("")).toBeNull();
    expect(parseResetPassword("   ")).toBeNull();
  });
  it("returns the trimmed password when 8+ chars", () => {
    expect(parseResetPassword("  goodpass123  ")).toBe("goodpass123");
  });
  it("throws when shorter than 8 chars", () => {
    expect(() => parseResetPassword("short1")).toThrow();
  });
  it("throws when the trimmed value is shorter than 8 chars", () => {
    expect(() => parseResetPassword("  ab  ")).toThrow();
  });
});
