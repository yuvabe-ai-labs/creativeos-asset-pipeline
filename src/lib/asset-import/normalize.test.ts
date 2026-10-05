import { describe, it, expect } from "vitest";
import { normalizeFacebook, normalizeInstagram, normalizeWebsite } from "./normalize";
import instagramPosts from "./__fixtures__/instagram-posts.json";
import facebookPosts from "./__fixtures__/facebook-posts.json";
import facebookNotAvailable from "./__fixtures__/facebook-not-available.json";
import websiteMedia from "./__fixtures__/website-media.json";

// The fixtures are trimmed real actor output from the 2026-10-05 benchmark (Chupps, Blue Tokai).
const NOW = new Date("2026-10-05T00:00:00Z");

describe("normalizeInstagram", () => {
  const { assets, error } = normalizeInstagram(instagramPosts, NOW);

  it("expands a carousel into its slides, videos with their poster", () => {
    expect(error).toBeUndefined();
    const carousel = instagramPosts[0];
    const slides = assets.filter((a) => a.sourceUrl === carousel.url);
    expect(slides).toHaveLength(carousel.childPosts.length);
    expect(slides.filter((a) => a.mediaType === "video")).toHaveLength(2);
    const video = slides.find((a) => a.mediaType === "video")!;
    expect(video.url).toContain(".mp4");
    expect(video.thumbnailUrl).toBeTruthy();
  });

  it("takes a reel's videoUrl and a single image's displayUrl", () => {
    const reel = assets.find((a) => a.sourceUrl === instagramPosts[1].url)!;
    expect(reel.mediaType).toBe("video");
    const image = assets.find((a) => a.sourceUrl === instagramPosts[2].url)!;
    expect(image.mediaType).toBe("image");
    expect(image.postedAt).toBe(instagramPosts[2].timestamp);
  });

  it("drops a pinned post older than the 3-month window", () => {
    expect(instagramPosts[3].isPinned).toBe(true);
    expect(assets.some((a) => a.sourceUrl === instagramPosts[3].url)).toBe(false);
  });

  it("keys every asset on its Meta CDN filename", () => {
    for (const a of assets) expect(a.ref).toMatch(/^meta:\d+_\d+_\d+_n\.jpg$/);
  });
});

describe("normalizeFacebook", () => {
  const { assets } = normalizeFacebook(facebookPosts, NOW);

  it("takes a reel's HD mp4 with its poster", () => {
    const reel = assets.find((a) => a.sourceUrl === facebookPosts[0].url)!;
    expect(reel.mediaType).toBe("video");
    expect(reel.url).toContain("video");
    expect(reel.thumbnailUrl).toBeTruthy();
  });

  it("fetches photos at original size by dropping ctp (D304)", () => {
    const photos = assets.filter((a) => a.sourceUrl === facebookPosts[1].url);
    expect(photos).toHaveLength(2);
    for (const p of photos) {
      expect(p.mediaType).toBe("image");
      expect(p.url).not.toContain("ctp=");
      expect(p.url).toContain("oh="); // still signed
    }
  });

  it("skips album videos that carry only a poster frame", () => {
    expect(assets.some((a) => a.sourceUrl === facebookPosts[2].url)).toBe(false);
  });

  it("reports a page that is not public", () => {
    const result = normalizeFacebook(facebookNotAvailable, NOW);
    expect(result.assets).toEqual([]);
    expect(result.error).toMatch(/isn't public/);
  });
});

describe("normalizeWebsite", () => {
  const { assets } = normalizeWebsite(websiteMedia);
  const urls = assets.map((a) => a.url);

  it("drops tracking pixels and favicons", () => {
    expect(urls.some((u) => u.includes("eventTracking"))).toBe(false);
    expect(urls.some((u) => u.includes("faveconnew"))).toBe(false);
  });

  it("keeps a small SVG logo, large images, the og:image and videos", () => {
    expect(urls.some((u) => u.includes("Chupps_Logo.svg"))).toBe(true);
    expect(urls.some((u) => u.includes("Recommended-by-athletes"))).toBe(true);
    expect(urls.some((u) => u.includes("og-image"))).toBe(true);
    expect(assets.find((a) => a.url.endsWith(".mp4"))?.mediaType).toBe("video");
  });

  it("drops a raster image under 200px", () => {
    const { assets: out } = normalizeWebsite([
      { mediaUrl: "https://x.com/badge.png", mediaType: "image", fileExtension: "png", width: 64, height: 64 },
      { mediaUrl: "https://x.com/hero.png", mediaType: "image", fileExtension: "png", width: 1200, height: null },
    ]);
    expect(out.map((a) => a.url)).toEqual(["https://x.com/hero.png"]);
  });
});
