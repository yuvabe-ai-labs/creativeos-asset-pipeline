import { describe, it, expect } from "vitest";
import { generateShareToken, isWellFormedToken } from "./token";

describe("share token", () => {
  it("is 43 base64url characters (32 bytes)", () => {
    const t = generateShareToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("is unique per call", () => {
    expect(generateShareToken()).not.toBe(generateShareToken());
  });
  it("recognises well-formed tokens only", () => {
    expect(isWellFormedToken(generateShareToken())).toBe(true);
    expect(isWellFormedToken("abc")).toBe(false);
    expect(isWellFormedToken("a".repeat(42) + "!")).toBe(false);
  });
});
