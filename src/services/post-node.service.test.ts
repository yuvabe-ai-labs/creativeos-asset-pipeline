// src/services/post-node.service.test.ts
import { describe, it, expect } from "vitest";
import { buildExportFilename } from "./post-node.service";

describe("buildExportFilename", () => {
  it("slugifies the title and appends the format", () => {
    expect(buildExportFilename("Diwali Offer", "ig-square")).toBe("diwali-offer-ig-square.png");
  });
  it("falls back to 'untitled-post' for an empty title", () => {
    expect(buildExportFilename("", "ig-story")).toBe("untitled-post-ig-story.png");
  });
  it("strips characters that aren't safe in a filename", () => {
    expect(buildExportFilename("50% Off!! Sale", "linkedin")).toBe("50-off-sale-linkedin.png");
  });
});
