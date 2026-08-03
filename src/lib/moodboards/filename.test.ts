import { describe, it, expect } from "vitest";
import { filenameFromUrl } from "./filename";

describe("filenameFromUrl", () => {
  it("uses the last path segment", () => {
    expect(filenameFromUrl("https://i.pinimg.com/736x/ab/cd/photo.jpg")).toBe("photo.jpg");
  });
  it("strips query and hash", () => {
    expect(filenameFromUrl("https://x/y/shot.png?w=736#frag")).toBe("shot.png");
  });
  it("falls back to reference.jpg when there is no image extension", () => {
    expect(filenameFromUrl("https://x/pin/12345")).toBe("reference.jpg");
  });
  it("falls back on an unparseable url", () => {
    expect(filenameFromUrl("not a url")).toBe("reference.jpg");
  });
});
