import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./thumbnail", () => ({ ogImage: vi.fn(), resolveThumbnailSource: vi.fn() }));
vi.mock("./apify", () => ({ fetchPostMedia: vi.fn(), fetchYouTubeDownload: vi.fn() }));

import { ogImage } from "./thumbnail";
import { resolveMediaSource, pinterestOriginal } from "./media";
import type { ReferenceKind } from "./constants";

const item = (kind: ReferenceKind, url: string) => ({ image_url: url, kind });

/** A fetch that reports `ok` only for the URLs listed, and always exposes a
 *  cancellable body so the probe's cleanup path is exercised. */
function probeFetch(okUrls: string[]) {
  return vi.fn(async (u: string) =>
    ({ ok: okUrls.includes(String(u)), body: { cancel: async () => {} } }) as unknown as Response,
  );
}

describe("resolveMediaSource — the free rungs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("an image IS the media", async () => {
    expect(await resolveMediaSource(item("image", "https://x/a.jpg"))).toEqual({
      url: "https://x/a.jpg",
    });
  });

  it("a gif IS the media", async () => {
    expect(await resolveMediaSource(item("gif", "https://x/a.gif"))).toEqual({
      url: "https://x/a.gif",
    });
  });

  it("a direct video file IS the media", async () => {
    expect(await resolveMediaSource(item("video", "https://x/a.mp4"))).toEqual({
      url: "https://x/a.mp4",
    });
  });

  // These reach the provider rungs; none of them should cost a network call.
  it("resolves the free rungs without any fetch", async () => {
    const fetchImpl = vi.fn();
    await resolveMediaSource(item("image", "https://x/a.jpg"), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("tiktok and link have no media of ours to own", async () => {
    expect(await resolveMediaSource(item("tiktok", "https://tiktok.com/@a/video/1"))).toBeNull();
    expect(await resolveMediaSource(item("link", "https://example.com/post"))).toBeNull();
  });
});

describe("resolveMediaSource — pinterest", () => {
  beforeEach(() => vi.resetAllMocks());

  it("upgrades the og:image to /originals/ and keeps the sized one as the thumbnail", async () => {
    vi.mocked(ogImage).mockResolvedValue("https://i.pinimg.com/736x/a1/e7/73/abc.jpg");
    const fetchImpl = probeFetch(["https://i.pinimg.com/originals/a1/e7/73/abc.jpg"]);

    const out = await resolveMediaSource(item("pinterest", "https://in.pinterest.com/pin/1/"), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(out).toEqual({
      url: "https://i.pinimg.com/originals/a1/e7/73/abc.jpg",
      thumbnailUrl: "https://i.pinimg.com/736x/a1/e7/73/abc.jpg",
    });
  });

  it("returns null when the pin has no og:image at all", async () => {
    vi.mocked(ogImage).mockResolvedValue(null);
    const out = await resolveMediaSource(item("pinterest", "https://in.pinterest.com/pin/1/"), {
      fetchImpl: probeFetch([]) as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });
});

describe("pinterestOriginal", () => {
  const sized = "https://i.pinimg.com/736x/a1/e7/73/abc.jpg";

  // Verified live: the extension of the original does NOT follow from the sized URL.
  // One pin's original was .png where its 736x variant was .jpg, and the wrong guess
  // returns 403 — so each candidate has to be probed.
  it("returns the first extension that responds, even when it differs from the source", async () => {
    const fetchImpl = probeFetch(["https://i.pinimg.com/originals/a1/e7/73/abc.png"]);
    expect(await pinterestOriginal(sized, fetchImpl as unknown as typeof fetch)).toBe(
      "https://i.pinimg.com/originals/a1/e7/73/abc.png",
    );
  });

  it("prefers jpg when several would work, so the common case costs one request", async () => {
    const fetchImpl = probeFetch([
      "https://i.pinimg.com/originals/a1/e7/73/abc.jpg",
      "https://i.pinimg.com/originals/a1/e7/73/abc.png",
    ]);
    expect(await pinterestOriginal(sized, fetchImpl as unknown as typeof fetch)).toBe(
      "https://i.pinimg.com/originals/a1/e7/73/abc.jpg",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the sized url when every extension 403s", async () => {
    const fetchImpl = probeFetch([]);
    expect(await pinterestOriginal(sized, fetchImpl as unknown as typeof fetch)).toBe(sized);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("leaves a url that is already /originals/ alone without probing", async () => {
    const already = "https://i.pinimg.com/originals/a1/e7/73/abc.jpg";
    const fetchImpl = probeFetch([]);
    expect(await pinterestOriginal(already, fetchImpl as unknown as typeof fetch)).toBe(already);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // A non-pinimg host (or an unexpected shape) must pass through untouched rather
  // than being rewritten into a URL that does not exist.
  it("passes through a url it does not recognise", async () => {
    const other = "https://example.com/image.jpg";
    const fetchImpl = probeFetch([]);
    expect(await pinterestOriginal(other, fetchImpl as unknown as typeof fetch)).toBe(other);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // A probe throwing is not a failure of the whole upgrade — try the next extension.
  it("keeps probing when one candidate throws", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      if (String(u).endsWith(".jpg")) throw new Error("socket hang up");
      return { ok: String(u).endsWith(".png"), body: null } as unknown as Response;
    });
    expect(await pinterestOriginal(sized, fetchImpl as unknown as typeof fetch)).toBe(
      "https://i.pinimg.com/originals/a1/e7/73/abc.png",
    );
  });
});
