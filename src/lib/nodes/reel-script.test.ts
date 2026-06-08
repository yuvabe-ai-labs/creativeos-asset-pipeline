import { describe, it, expect } from "vitest";
import { looksLikeReelScript } from "./reel-script";

describe("looksLikeReelScript", () => {
  it("is true when a reel-script section key is present", () => {
    expect(looksLikeReelScript({ strategic_objective: "x" })).toBe(true);
    expect(looksLikeReelScript({ visual_script: {} })).toBe(true);
    expect(looksLikeReelScript({ on_screen_text: {} })).toBe(true);
  });

  it("is false for an unrelated object", () => {
    expect(looksLikeReelScript({ foo: "bar" })).toBe(false);
    expect(looksLikeReelScript({})).toBe(false);
  });
});
