import { describe, it, expect } from "vitest";
import { shareCodeFor, toCanonicalShareToken } from "./token";

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
