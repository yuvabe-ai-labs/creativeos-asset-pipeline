import { describe, it, expect } from "vitest";
import { galleryImageTitle } from "./gallery-image-title";
import type { GalleryImage } from "./types";

const img = (source: GalleryImage["source"], filename: string): GalleryImage =>
  ({ id: "i", imageUrl: "u", filename, subtitle: "", source });

describe("galleryImageTitle", () => {
  it("drops the extension from a picked file's name", () => {
    expect(galleryImageTitle(img("drive", "hero-shot.png"))).toBe("hero-shot");
  });

  it("keeps a storyboard panel's title whole, dots and all", () => {
    expect(galleryImageTitle(img("storyboard", "S3 · STEP 2. POUR — storyboard"))).toBe("S3 · STEP 2. POUR — storyboard");
  });
});
