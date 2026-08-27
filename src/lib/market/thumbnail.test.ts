import { describe, it, expect, vi } from "vitest";
import { resolveThumbnailSource } from "./thumbnail";

const okJson = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

describe("resolveThumbnailSource", () => {
  it("derives YouTube thumbnails without any fetch", async () => {
    const fetchImpl = vi.fn();
    const out = await resolveThumbnailSource(
      "https://youtu.be/dQw4w9WgXcQ",
      "youtube",
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the image URL itself for image/gif kinds", async () => {
    expect(await resolveThumbnailSource("https://c.dn/a.jpg", "image")).toBe("https://c.dn/a.jpg");
    expect(await resolveThumbnailSource("https://c.dn/a.gif", "gif")).toBe("https://c.dn/a.gif");
  });

  it("reads thumbnail_url from the TikTok oEmbed response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okJson({ thumbnail_url: "https://p16.tiktokcdn.com/thumb.jpg" }));
    const out = await resolveThumbnailSource(
      "https://www.tiktok.com/@u/video/123",
      "tiktok",
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toBe("https://p16.tiktokcdn.com/thumb.jpg");
    expect(fetchImpl.mock.calls[0][0]).toContain("tiktok.com/oembed");
  });

  it("reads thumbnail_url from the Instagram oEmbed response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okJson({ thumbnail_url: "https://scontent.cdninstagram.com/t.jpg" }));
    const out = await resolveThumbnailSource(
      "https://www.instagram.com/reel/C8xyz/",
      "instagram",
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toBe("https://scontent.cdninstagram.com/t.jpg");
  });

  it("returns null (never throws) when oEmbed fails — the degraded-tile path", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    expect(
      await resolveThumbnailSource(
        "https://www.tiktok.com/@u/video/1",
        "tiktok",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
    const notOk = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(
      await resolveThumbnailSource(
        "https://www.instagram.com/reel/x/",
        "instagram",
        notOk as unknown as typeof fetch,
      ),
    ).toBeNull();
  });

  it("returns null for video and link kinds (no derivable thumbnail)", async () => {
    expect(await resolveThumbnailSource("https://c.dn/a.mp4", "video")).toBeNull();
    expect(await resolveThumbnailSource("https://blog.example/x", "link")).toBeNull();
  });
});
