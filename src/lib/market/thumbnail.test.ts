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

  it("reads thumbnail_url from the Instagram oEmbed response when present (token tier)", async () => {
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

  // Tokenless oEmbed returns ONLY {version, provider_name, provider_url, type, width,
  // html} — no thumbnail_url (verified against the live endpoint 2026-08-27). The
  // reel's cover frame is instead embedded in the /embed page as display_url.
  // Last resort in the D190 chain: reached only when oEmbed has no thumbnail AND the
  // post page yields no og:image (e.g. Instagram gated it behind a login wall).
  it("falls back to the embed page's display_url when oEmbed and og:image both fail", async () => {
    const fetchImpl = vi
      .fn()
      // 1st call: oEmbed, tokenless shape — no thumbnail_url
      .mockResolvedValueOnce(okJson({ version: "1.0", provider_name: "Instagram", html: "<blockquote/>" }))
      // 2nd call: the post page, gated — no OG tags
      .mockResolvedValueOnce({ ok: true, text: async () => "<html>login wall</html>" } as unknown as Response)
      // 3rd call: the /embed page, whose JSON blob is double-escaped
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '...\\"display_url\\":\\"https:\\\\/\\\\/instagram.fpny2-1.fna.fbcdn.net\\\\/v\\\\/t51\\\\/cover.jpg?a=1\\u00253D\\"...',
      } as unknown as Response);

    const out = await resolveThumbnailSource(
      "https://www.instagram.com/reel/DaPYNhjMCBS/",
      "instagram",
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toBe("https://instagram.fpny2-1.fna.fbcdn.net/v/t51/cover.jpg?a=1%3D");
    expect(fetchImpl.mock.calls[2][0]).toBe("https://www.instagram.com/reel/DaPYNhjMCBS/embed");
  });

  it("returns null when oEmbed, og:image and the embed page all yield nothing", async () => {
    const nothing = { ok: true, text: async () => "<html>no poster here</html>" } as unknown as Response;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({ version: "1.0" })) // oEmbed, no thumbnail
      .mockResolvedValueOnce(nothing) // og:image
      .mockResolvedValueOnce(nothing); // embed page
    expect(
      await resolveThumbnailSource(
        "https://www.instagram.com/reel/x/",
        "instagram",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBeNull();
  });

  // og:image is the general case (D190) — it is what makes an article, a brand site
  // or any other pasted page visual, instead of a bare link tile.
  it("reads og:image for a plain link", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><head><meta property="og:image" content="https://blog.example/cover.png"></head></html>',
    } as unknown as Response);
    expect(
      await resolveThumbnailSource(
        "https://blog.example/post",
        "link",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBe("https://blog.example/cover.png");
  });

  it("handles reversed meta attribute order, entities and relative og:image URLs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<meta content="/img/a.png?w=1&amp;h=2" property="og:image">',
    } as unknown as Response);
    expect(
      await resolveThumbnailSource(
        "https://site.example/deep/page",
        "link",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBe("https://site.example/img/a.png?w=1&h=2");
  });

  it("prefers og:image over the Instagram embed-page scrape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({ version: "1.0" })) // oEmbed: no thumbnail
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<meta property="og:image" content="https://cdn.ig/og.jpg">',
      } as unknown as Response);
    const out = await resolveThumbnailSource(
      "https://www.instagram.com/reel/C8xyz/",
      "instagram",
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toBe("https://cdn.ig/og.jpg");
    expect(fetchImpl).toHaveBeenCalledTimes(2); // never reached the embed page
  });

  it("falls back to og:image for TikTok when oEmbed is unreachable", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("dns blocked"))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<meta property="og:image" content="https://p16.tiktokcdn.com/og.jpg">',
      } as unknown as Response);
    expect(
      await resolveThumbnailSource(
        "https://www.tiktok.com/@u/video/1",
        "tiktok",
        fetchImpl as unknown as typeof fetch,
      ),
    ).toBe("https://p16.tiktokcdn.com/og.jpg");
  });

  it("never fetches for a YouTube URL — the thumbnail is derived", async () => {
    const fetchImpl = vi.fn();
    await resolveThumbnailSource(
      "https://www.youtube.com/watch?v=abc12345678",
      "youtube",
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
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
