import { describe, it, expect } from "vitest";
import { keyFingerprint } from "../server";

describe("the Gemini key's fingerprint", () => {
  it("shows the first 8 and last 4 characters and the length, never the middle", () => {
    const key = "AQ.Ab8RNsecretsecretsecretsecretsecretsecretsecmeIw";
    expect(keyFingerprint(key)).toBe(`AQ.Ab8RN…meIw (${key.length} chars)`);
    expect(keyFingerprint(key)).not.toContain("secret");
  });

  it("shows nothing of a key too short to hide its middle", () => {
    expect(keyFingerprint("short-key-123")).toBe("(13 chars, too short to show)");
  });
});
