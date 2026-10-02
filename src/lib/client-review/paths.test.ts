import { describe, it, expect } from "vitest";
import { isPublicReviewPath, sharePathFor } from "./paths";

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
  it("builds the public path", () => {
    expect(sharePathFor("tok")).toBe("/r/tok");
  });
});
