import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({
  addItem: vi.fn(),
  updateItemThumbnail: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  uploadMarketThumbnail: vi.fn(),
}));
vi.mock("./thumbnail", () => ({
  resolveThumbnailSource: vi.fn(),
}));

import { addItem, updateItemThumbnail } from "@/lib/db/moodboards";
import { uploadMarketThumbnail } from "@/lib/storage";
import { resolveThumbnailSource } from "./thumbnail";
import { ingestReference } from "./ingest";

const baseItem = {
  id: "item-1",
  moodboard_id: "b-1",
  image_url: "u",
  source_url: null,
  kind: "youtube" as const,
  note: null,
  added_by: null,
  thumbnail_url: null,
  position: 0,
  added_at: "now",
};

function mockThumbFetch(bytes: number, contentType = "image/jpeg") {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  } as unknown as Response);
}

describe("ingestReference", () => {
  beforeEach(() => vi.resetAllMocks());

  it("classifies, inserts, re-hosts the thumbnail, and updates the row", async () => {
    vi.mocked(addItem).mockResolvedValue({ ...baseItem });
    vi.mocked(resolveThumbnailSource).mockResolvedValue(
      "https://img.youtube.com/vi/x/hqdefault.jpg",
    );
    vi.mocked(uploadMarketThumbnail).mockResolvedValue({ url: "https://gcs/thumb.jpg", path: "p" });

    const item = await ingestReference({
      boardId: "b-1",
      clientId: "c-1",
      url: "https://youtu.be/dQw4w9WgXcQ",
      note: "nice hook",
      addedBy: "user-1",
      fetchImpl: mockThumbFetch(1000) as unknown as typeof fetch,
    });

    expect(vi.mocked(addItem)).toHaveBeenCalledWith(
      "b-1",
      expect.objectContaining({
        imageUrl: "https://youtu.be/dQw4w9WgXcQ",
        kind: "youtube",
        note: "nice hook",
        addedBy: "user-1",
      }),
    );
    expect(vi.mocked(uploadMarketThumbnail)).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c-1", itemId: "item-1", contentType: "image/jpeg" }),
    );
    expect(vi.mocked(updateItemThumbnail)).toHaveBeenCalledWith("item-1", "https://gcs/thumb.jpg");
    expect(item.thumbnail_url).toBe("https://gcs/thumb.jpg");
  });

  it("still saves when no thumbnail source resolves (degraded tile)", async () => {
    vi.mocked(addItem).mockResolvedValue({ ...baseItem, kind: "link" });
    vi.mocked(resolveThumbnailSource).mockResolvedValue(null);

    const item = await ingestReference({
      boardId: "b-1",
      clientId: "c-1",
      url: "https://someblog.com/x",
    });

    expect(item.thumbnail_url).toBeNull();
    expect(vi.mocked(uploadMarketThumbnail)).not.toHaveBeenCalled();
    expect(vi.mocked(updateItemThumbnail)).not.toHaveBeenCalled();
  });

  it("still saves when the thumbnail download itself fails", async () => {
    vi.mocked(addItem).mockResolvedValue({ ...baseItem });
    vi.mocked(resolveThumbnailSource).mockResolvedValue("https://img.example/t.jpg");
    const failingFetch = vi.fn().mockRejectedValue(new Error("network"));

    const item = await ingestReference({
      boardId: "b-1",
      clientId: "c-1",
      url: "https://youtu.be/abc",
      fetchImpl: failingFetch as unknown as typeof fetch,
    });
    expect(item.id).toBe("item-1");
    expect(item.thumbnail_url).toBeNull();
  });

  it("skips oversized thumbnails instead of failing", async () => {
    vi.mocked(addItem).mockResolvedValue({ ...baseItem });
    vi.mocked(resolveThumbnailSource).mockResolvedValue("https://img.example/huge.jpg");

    const item = await ingestReference({
      boardId: "b-1",
      clientId: "c-1",
      url: "https://youtu.be/abc",
      fetchImpl: mockThumbFetch(6 * 1024 * 1024) as unknown as typeof fetch,
    });
    expect(vi.mocked(uploadMarketThumbnail)).not.toHaveBeenCalled();
    expect(item.thumbnail_url).toBeNull();
  });
});
