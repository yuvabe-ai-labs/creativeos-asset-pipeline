import { describe, it, expect } from "vitest";
import { isPublicReviewPath, sharePathFor } from "./paths";
import { toCanonicalShareToken } from "./token";

describe("isPublicReviewPath", () => {
  it("matches /r and anything under /r/", () => {
    expect(isPublicReviewPath("/r")).toBe(true);
    expect(isPublicReviewPath("/r/abc")).toBe(true);
  });
  it("does not match routes that merely start with r", () => {
    expect(isPublicReviewPath("/review")).toBe(false);
    expect(isPublicReviewPath("/clients/x")).toBe(false);
  });
});

describe("sharePathFor", () => {
  it("puts the cut's title in front of the code", () => {
    expect(sharePathFor("b4b4", "Dosa Brand Film")).toBe("/r/dosa-brand-film-b4b4");
  });

  it("makes any title URL-safe and readable", () => {
    expect(sharePathFor("b4b4", "  Café — v2 (FINAL)!! ")).toBe("/r/cafe-v2-final-b4b4");
  });

  it("uses 'cut' when the node has no title", () => {
    expect(sharePathFor("b4b4", "")).toBe("/r/cut-b4b4");
    expect(sharePathFor("b4b4", "!!!")).toBe("/r/cut-b4b4");
  });

  it("keeps long titles to a readable length, cut at a word", () => {
    const path = sharePathFor("b4b4", "The quick brown fox jumps over the lazy dog again and again");
    expect(path).toBe("/r/the-quick-brown-fox-jumps-over-the-lazy-b4b4");
  });

  it("leaves a legacy 43-character token as it was", () => {
    const legacy = "F9j8bFp2aSsS_VgLAeVpAz25wS2KJlxu44yHXf7QHB0";
    expect(sharePathFor(legacy, "Dosa")).toBe(`/r/${legacy}`);
  });

  it("round-trips: the link parses back to its code", () => {
    expect(toCanonicalShareToken(sharePathFor("b4b4c9", "Café 2").slice(3))).toBe("b4b4c9");
  });
});
