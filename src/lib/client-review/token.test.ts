import { describe, it, expect } from "vitest";
import { parseReviewLink, shareCodeFor, toCanonicalShareToken } from "./token";

const NODE = "b4b4c9e2-1f3a-4d5e-8a7b-0c1d2e3f4a5b";

describe("shareCodeFor", () => {
  it("is the first four hex characters of the node id, lower-case", () => {
    expect(shareCodeFor(NODE)).toBe("b4b4");
  });

  it("grows one hex character per extra step when a shorter code is taken", () => {
    expect(shareCodeFor(NODE, 1)).toBe("b4b4c");
    expect(shareCodeFor(NODE, 2)).toBe("b4b4c9");
  });

  it("skips the uuid's dashes", () => {
    expect(shareCodeFor(NODE, 5)).toBe("b4b4c9e21");
  });
});

describe("toCanonicalShareToken", () => {
  it("reads the code from the end of a titled link, ignoring the title", () => {
    expect(toCanonicalShareToken("dosa-brand-film-b4b4")).toBe("b4b4");
    expect(toCanonicalShareToken("renamed-later-b4b4")).toBe("b4b4");
    expect(toCanonicalShareToken("cut-b4b4c9")).toBe("b4b4c9");
  });

  it("is case-insensitive and accepts a bare code", () => {
    expect(toCanonicalShareToken("Dosa-Film-B4B4")).toBe("b4b4");
    expect(toCanonicalShareToken("b4b4")).toBe("b4b4");
  });

  it("still accepts a legacy 43-character token, unchanged", () => {
    const legacy = "F9j8bFp2aSsS_VgLAeVpAz25wS2KJlxu44yHXf7QHB0";
    expect(toCanonicalShareToken(legacy)).toBe(legacy);
  });

  it("rejects anything else without touching the database", () => {
    expect(toCanonicalShareToken("abc")).toBeNull();
    expect(toCanonicalShareToken("dosa-film-b4b")).toBeNull();
    expect(toCanonicalShareToken("dosa-film")).toBeNull();
    expect(toCanonicalShareToken("film-b4b4/../x")).toBeNull();
  });
});

describe("parseReviewLink (D496)", () => {
  it("reads the version from the end of the link", () => {
    expect(parseReviewLink("dosa-brand-film-b4b4-v2")).toEqual({ token: "b4b4", versionNo: 2 });
    expect(parseReviewLink("Dosa-B4B4-V12")).toEqual({ token: "b4b4", versionNo: 12 });
  });

  it("treats a link without a suffix as v1", () => {
    expect(parseReviewLink("dosa-brand-film-b4b4")).toEqual({ token: "b4b4", versionNo: 1 });
    expect(parseReviewLink("dosa-b4b4-v1")).toEqual({ token: "b4b4", versionNo: 1 });
  });

  it("ignores a version-like word inside the title", () => {
    expect(parseReviewLink("cafe-v2-final-b4b4")).toEqual({ token: "b4b4", versionNo: 1 });
  });

  it("reads a titled link that is 43 characters long as titled, not legacy", () => {
    const link = "apple-apple-spring-forward-a5qhqpgy-92ec-v2";
    expect(link).toHaveLength(43);
    expect(parseReviewLink(link)).toEqual({ token: "92ec", versionNo: 2 });
  });

  it("accepts a legacy token, bare or with a version", () => {
    const legacy = "F9j8bFp2aSsS_VgLAeVpAz25wS2KJlxu44yHXf7QHB0";
    expect(parseReviewLink(legacy)).toEqual({ token: legacy, versionNo: 1 });
    expect(parseReviewLink(`${legacy}-v3`)).toEqual({ token: legacy, versionNo: 3 });
  });

  it("rejects malformed links and v0", () => {
    expect(parseReviewLink("dosa-film")).toBeNull();
    expect(parseReviewLink("dosa-b4b4-v0")).toBeNull();
    expect(parseReviewLink("b4b4-v")).toBeNull();
  });
});
