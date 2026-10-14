import { describe, it, expect } from "vitest";
import { CUT_CONTENT_TYPES, CUT_EXTENSIONS } from "./constants";

describe("CUT_CONTENT_TYPES", () => {
  it("maps every cut extension to a video/* content type", () => {
    for (const ext of CUT_EXTENSIONS) {
      expect(CUT_CONTENT_TYPES[ext]).toMatch(/^video\//);
    }
  });
});
