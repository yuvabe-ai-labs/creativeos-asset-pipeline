import { describe, it, expect } from "vitest";
import { buildExtractingMessage } from "./build-message";

describe("buildExtractingMessage", () => {
  it("returns 'Reading website research…' when only research is present", () => {
    expect(buildExtractingMessage({ hasResearch: true, docCount: 0, imgCount: 0 }))
      .toBe("Reading website research…");
  });

  it("uses singular when there is exactly one document or image", () => {
    expect(buildExtractingMessage({ hasResearch: false, docCount: 1, imgCount: 1 }))
      .toBe("Reading 1 document and analyzing 1 image…");
  });

  it("uses plural for multiple documents and images", () => {
    expect(buildExtractingMessage({ hasResearch: false, docCount: 3, imgCount: 5 }))
      .toBe("Reading 3 documents and analyzing 5 images…");
  });

  it("omits the images clause when there are none", () => {
    expect(buildExtractingMessage({ hasResearch: false, docCount: 3, imgCount: 0 }))
      .toBe("Reading 3 documents…");
  });

  it("omits the documents clause when there are none", () => {
    expect(buildExtractingMessage({ hasResearch: false, docCount: 0, imgCount: 2 }))
      .toBe("Analyzing 2 images…");
  });

  it("ignores hasResearch when docs/images are present (research is bundled into docs)", () => {
    expect(buildExtractingMessage({ hasResearch: true, docCount: 3, imgCount: 0 }))
      .toBe("Reading 3 documents…");
  });
});
