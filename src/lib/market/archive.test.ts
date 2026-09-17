import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({
  getItem: vi.fn(),
  claimArchive: vi.fn(),
  completeArchive: vi.fn(),
  failArchive: vi.fn(),
  skipArchive: vi.fn(),
  updateItemThumbnail: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  uploadMarketMedia: vi.fn(),
  uploadMarketThumbnail: vi.fn(),
}));
vi.mock("./media", () => ({ resolveMediaSource: vi.fn() }));

import {
  getItem,
  claimArchive,
  completeArchive,
  failArchive,
  skipArchive,
  updateItemThumbnail,
} from "@/lib/db/moodboards";
import { uploadMarketMedia, uploadMarketThumbnail } from "@/lib/storage";
import { resolveMediaSource } from "./media";
import { archiveItem } from "./archive";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "i1",
    moodboard_id: "b1",
    image_url: "https://x/a.mp4",
    source_url: null,
    kind: "video",
    note: null,
    added_by: null,
    thumbnail_url: "https://gcs/t.jpg",
    position: 0,
    added_at: "now",
    media_url: null,
    media_bytes: null,
    media_type: null,
    archive_status: "pending",
    archive_error: null,
    archive_attempts: 0,
    archive_started_at: null,
    archived_at: null,
    ...over,
  };
}

/** A download response carrying `bytes` of `contentType`. */
function bodyFetch(bytes: number, contentType = "video/mp4") {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  } as unknown as Response);
}

describe("archiveItem", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APIFY_TOKEN = "tok";
  });

  it("downloads, uploads and marks the row ready", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });
    vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });

    const out = await archiveItem("i1", "c1", { fetchImpl: bodyFetch(2048) as never });

    expect(out).toEqual({ ok: true, bytes: 2048 });
    expect(vi.mocked(completeArchive)).toHaveBeenCalledWith("i1", {
      mediaUrl: "https://gcs/m.mp4",
      mediaBytes: 2048,
      mediaType: "video/mp4",
    });
  });

  it("claims the row with an incremented attempt count before the slow work", async () => {
    vi.mocked(getItem).mockResolvedValue(row({ archive_attempts: 2 }) as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });
    vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });

    await archiveItem("i1", "c1", { fetchImpl: bodyFetch(10) as never });

    expect(vi.mocked(claimArchive)).toHaveBeenCalledWith("i1", 3);
  });

  // The sweep, the ingest enqueue and a manual retry can all land on one row.
  // Re-downloading a file we already own would be pure waste.
  it("is a no-op when the row is already ready", async () => {
    vi.mocked(getItem).mockResolvedValue(row({ archive_status: "ready" }) as never);
    const fetchImpl = bodyFetch(1);

    const out = await archiveItem("i1", "c1", { fetchImpl: fetchImpl as never });

    expect(out).toEqual({ ok: true, alreadyDone: true });
    expect(vi.mocked(claimArchive)).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips a kind with no media of ours to own", async () => {
    vi.mocked(getItem).mockResolvedValue(row({ kind: "link" }) as never);
    vi.mocked(resolveMediaSource).mockResolvedValue(null);

    const out = await archiveItem("i1", "c1", { fetchImpl: bodyFetch(1) as never });

    expect(out).toEqual({ ok: true, skipped: true });
    expect(vi.mocked(skipArchive)).toHaveBeenCalledWith("i1");
    expect(vi.mocked(failArchive)).not.toHaveBeenCalled();
  });

  it("records a reason instead of throwing when the download fails", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });

    const out = await archiveItem("i1", "c1", {
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 }) as never,
    });

    expect(out).toEqual({ ok: false, reason: "download failed: HTTP 404" });
    expect(vi.mocked(failArchive)).toHaveBeenCalledWith("i1", "download failed: HTTP 404");
  });

  it("records a reason when the provider itself throws", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockRejectedValue(new Error("Apify request failed: HTTP 402"));

    const out = await archiveItem("i1", "c1", { fetchImpl: bodyFetch(1) as never });

    expect(out).toEqual({ ok: false, reason: "Apify request failed: HTTP 402" });
    expect(vi.mocked(failArchive)).toHaveBeenCalledWith("i1", "Apify request failed: HTTP 402");
  });

  it("rejects a response past the size limit without uploading it", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });

    const out = await archiveItem("i1", "c1", {
      fetchImpl: bodyFetch(201 * 1024 * 1024) as never,
    });

    expect(out.ok).toBe(false);
    expect(vi.mocked(uploadMarketMedia)).not.toHaveBeenCalled();
  });

  it("rejects an empty response", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });

    const out = await archiveItem("i1", "c1", { fetchImpl: bodyFetch(0) as never });

    expect(out.ok).toBe(false);
    expect(vi.mocked(uploadMarketMedia)).not.toHaveBeenCalled();
  });

  // The Instagram CDN rejects ranged GETs outright (verified 2026-09-11): the first
  // spike failed with a bare `fetch failed` until the Range header was dropped.
  it("sends no Range header and no custom User-Agent", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });
    vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });
    const fetchImpl = bodyFetch(64);

    await archiveItem("i1", "c1", { fetchImpl: fetchImpl as never });

    const init = fetchImpl.mock.calls[0][1];
    expect(init?.headers ?? {}).toEqual({});
  });

  it("reports a missing item rather than throwing", async () => {
    vi.mocked(getItem).mockResolvedValue(null);
    const out = await archiveItem("gone", "c1", { fetchImpl: bodyFetch(1) as never });
    expect(out).toEqual({ ok: false, reason: "item not found" });
  });

  describe("thumbnail backfill (D272)", () => {
    it("fills a null thumbnail from the same payload", async () => {
      vi.mocked(getItem).mockResolvedValue(
        row({ kind: "instagram", thumbnail_url: null }) as never,
      );
      vi.mocked(resolveMediaSource).mockResolvedValue({
        url: "https://cdn/a.mp4",
        thumbnailUrl: "https://cdn/d.jpg",
      });
      vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });
      vi.mocked(uploadMarketThumbnail).mockResolvedValue({ url: "https://gcs/t.jpg", path: "p" });

      await archiveItem("i1", "c1", { fetchImpl: bodyFetch(2048, "video/mp4") as never });

      expect(vi.mocked(updateItemThumbnail)).toHaveBeenCalledWith("i1", "https://gcs/t.jpg");
    });

    it("leaves an existing thumbnail alone", async () => {
      vi.mocked(getItem).mockResolvedValue(row({ thumbnail_url: "https://gcs/old.jpg" }) as never);
      vi.mocked(resolveMediaSource).mockResolvedValue({
        url: "https://cdn/a.mp4",
        thumbnailUrl: "https://cdn/d.jpg",
      });
      vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });

      await archiveItem("i1", "c1", { fetchImpl: bodyFetch(2048) as never });

      expect(vi.mocked(updateItemThumbnail)).not.toHaveBeenCalled();
    });

    // A media archive that succeeded must not be reported as failed because its
    // decorative preview did not — the same rule ingest applies at capture time.
    it("still reports success when the thumbnail step throws", async () => {
      vi.mocked(getItem).mockResolvedValue(row({ thumbnail_url: null }) as never);
      vi.mocked(resolveMediaSource).mockResolvedValue({
        url: "https://cdn/a.mp4",
        thumbnailUrl: "https://cdn/d.jpg",
      });
      vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });
      vi.mocked(uploadMarketThumbnail).mockRejectedValue(new Error("GCS down"));

      const out = await archiveItem("i1", "c1", { fetchImpl: bodyFetch(2048) as never });

      expect(out).toEqual({ ok: true, bytes: 2048 });
      expect(vi.mocked(failArchive)).not.toHaveBeenCalled();
    });

    it("does nothing when the payload carried no still", async () => {
      vi.mocked(getItem).mockResolvedValue(row({ thumbnail_url: null }) as never);
      vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });
      vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });

      await archiveItem("i1", "c1", { fetchImpl: bodyFetch(2048) as never });

      expect(vi.mocked(updateItemThumbnail)).not.toHaveBeenCalled();
    });
  });
});
