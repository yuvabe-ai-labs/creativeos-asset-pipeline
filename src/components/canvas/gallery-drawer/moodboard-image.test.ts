import { describe, expect, it } from "vitest";
import type { MoodboardItem } from "@/lib/db/moodboards";
import { moodboardItemToGalleryImage } from "./moodboard-image";

function item(overrides: Partial<MoodboardItem> = {}): MoodboardItem {
  return {
    id: "it-1",
    moodboard_id: "mb-1",
    image_url: "https://cdn.example.com/photos/cream.jpg",
    source_url: null,
    kind: "image",
    note: null,
    added_by: null,
    thumbnail_url: null,
    position: 0,
    added_at: "2026-08-30T00:00:00Z",
    ...overrides,
  };
}

describe("moodboardItemToGalleryImage", () => {
  it("maps a plain image item with a filename derived from its URL", () => {
    const img = moodboardItemToGalleryImage(item());
    expect(img.source).toBe("moodboard");
    expect(img.imageUrl).toBe("https://cdn.example.com/photos/cream.jpg");
    expect(img.filename).toBe("cream.jpg");
    expect(img.mediaUrl).toBe("https://cdn.example.com/photos/cream.jpg");
  });

  it("prefers the re-hosted thumbnail for grid rendering when present", () => {
    const img = moodboardItemToGalleryImage(
      item({ thumbnail_url: "https://gcs.example.com/thumb.jpg" }),
    );
    expect(img.imageUrl).toBe("https://gcs.example.com/thumb.jpg");
    // The lightbox still plays the original reference URL.
    expect(img.mediaUrl).toBe("https://cdn.example.com/photos/cream.jpg");
  });

  it("labels non-image kinds by what they are, not a fake filename", () => {
    const img = moodboardItemToGalleryImage(
      item({
        kind: "instagram",
        image_url: "https://www.instagram.com/p/abc123/",
        thumbnail_url: "https://gcs.example.com/ig-thumb.jpg",
      }),
    );
    expect(img.filename).toBe("Instagram post · instagram.com");
    expect(img.kind).toBe("instagram");
  });

  it("uses the note as subtitle when present, falling back to the added date", () => {
    expect(moodboardItemToGalleryImage(item({ note: "MR: festive angle" })).subtitle).toBe(
      "MR: festive angle",
    );
    expect(moodboardItemToGalleryImage(item()).subtitle).toBe(
      new Date("2026-08-30T00:00:00Z").toLocaleDateString(),
    );
  });
});
