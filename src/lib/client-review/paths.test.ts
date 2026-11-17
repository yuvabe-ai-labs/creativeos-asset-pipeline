import { describe, it, expect } from "vitest";
import { isPublicReviewPath, sharePathFor } from "./paths";
import { parseReviewLink, toCanonicalShareToken } from "./token";

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

// A pre-version v1: the link exactly as it was sent before D496.
const OLD_V1 = { versionNo: 1, legacyLink: true };

describe("sharePathFor", () => {
  it("puts the cut's title in front of the code", () => {
    expect(sharePathFor("b4b4", "Dosa Brand Film", OLD_V1)).toBe("/r/dosa-brand-film-b4b4");
  });

  it("makes any title URL-safe and readable", () => {
    expect(sharePathFor("b4b4", "  Café — v2 (FINAL)!! ", OLD_V1)).toBe("/r/cafe-v2-final-b4b4");
  });

  it("uses 'cut' when the node has no title", () => {
    expect(sharePathFor("b4b4", "", OLD_V1)).toBe("/r/cut-b4b4");
    expect(sharePathFor("b4b4", "!!!", OLD_V1)).toBe("/r/cut-b4b4");
  });

  it("keeps long titles to a readable length, cut at a word", () => {
    const path = sharePathFor("b4b4", "The quick brown fox jumps over the lazy dog again and again", OLD_V1);
    expect(path).toBe("/r/the-quick-brown-fox-jumps-over-the-lazy-b4b4");
  });

  it("leaves a legacy 43-character token as it was", () => {
    const legacy = "F9j8bFp2aSsS_VgLAeVpAz25wS2KJlxu44yHXf7QHB0";
    expect(sharePathFor(legacy, "Dosa", OLD_V1)).toBe(`/r/${legacy}`);
    expect(sharePathFor(legacy, "Dosa", { versionNo: 2, legacyLink: false })).toBe(`/r/${legacy}-v2`);
  });

  it("names the version for every other version (D496)", () => {
    expect(sharePathFor("b4b4", "Dosa", { versionNo: 1, legacyLink: false })).toBe("/r/dosa-b4b4-v1");
    expect(sharePathFor("b4b4", "Dosa", { versionNo: 3, legacyLink: false })).toBe("/r/dosa-b4b4-v3");
  });

  it("round-trips: the link parses back to its code and version", () => {
    expect(toCanonicalShareToken(sharePathFor("b4b4c9", "Café 2", OLD_V1).slice(3))).toBe("b4b4c9");
    expect(parseReviewLink(sharePathFor("b4b4c9", "Café 2", { versionNo: 4, legacyLink: false }).slice(3)))
      .toEqual({ token: "b4b4c9", versionNo: 4 });
  });
});
