import { describe, it, expect } from "vitest";
import { clipboardImageMime, mimeToImageExt } from "./clipboard-image";

describe("clipboardImageMime", () => {
  it("returns the first image/* type", () => {
    expect(clipboardImageMime(["text/plain", "image/png"])).toBe("image/png");
  });
  it("returns null when no image type is present", () => {
    expect(clipboardImageMime(["text/plain", "text/html"])).toBeNull();
  });
  it("returns null for an empty list", () => {
    expect(clipboardImageMime([])).toBeNull();
  });
});

describe("mimeToImageExt", () => {
  it("maps supported image mimes to extensions", () => {
    expect(mimeToImageExt("image/png")).toBe("png");
    expect(mimeToImageExt("image/jpeg")).toBe("jpg");
    expect(mimeToImageExt("image/webp")).toBe("webp");
  });
  it("returns null for unsupported image mimes", () => {
    expect(mimeToImageExt("image/gif")).toBeNull();
    expect(mimeToImageExt("image/svg+xml")).toBeNull();
  });
  it("returns null for non-image mimes", () => {
    expect(mimeToImageExt("text/plain")).toBeNull();
  });
});
