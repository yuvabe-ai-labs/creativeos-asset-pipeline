// Where the archived BYTES come from, per kind — the media counterpart to
// resolveThumbnailSource (D268), and laddered on the same principle: cheapest and
// most durable first.
//
//   1. the reference IS the media  — image/gif/video. No network call, no provider.
//   2. og:image + an upgrade       — pinterest. No provider, three cheap probes.
//   3. a paid provider call        — instagram, youtube. Only these two cost money.
//   4. nothing                     — tiktok/link have no media file of ours to own.
//
// Every field name below was verified against a live provider run on 2026-09-11
// (design spec §1). None of it comes from vendor documentation, which was wrong about
// all three platforms: the actor Apify recommends for Instagram does not document
// `videoUrl`, the YouTube actor does not document Shorts support or its output field
// names, and Pinterest's og:image is not the full-resolution image it appears to be.
import "server-only";
import type { ReferenceKind } from "./constants";
import { ogImage } from "./thumbnail";
import { fetchPostMedia, fetchYouTubeDownload } from "./apify";

export type MediaSource = {
  /** The file to download and re-host. */
  url: string;
  contentType?: string;
  /** A cover still from the SAME payload, used to repair a null thumbnail (D272). */
  thumbnailUrl?: string;
};

// jpg first: it is the common case, so the usual pin costs one probe rather than two.
const PINTEREST_ORIGINAL_EXTS = ["jpg", "png", "webp"] as const;
const PINIMG_SIZED = /^(https:\/\/i\.pinimg\.com\/)[^/]+\/(.+)\.\w+$/;

/**
 * Upgrade a pinimg `/736x/` URL to `/originals/` — a 7-10x resolution gain (29 KB to
 * 292 KB on one verified pin) for at most three cheap requests.
 *
 * The extension does NOT follow from the sized URL. A verified pin served its original
 * as .png where the 736x variant was .jpg, and asking for the wrong extension returns
 * 403 — so each candidate is probed and the sized URL is the fallback. An upgrade is a
 * bonus, never a reason to fail the archive.
 */
export async function pinterestOriginal(
  sizedUrl: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (sizedUrl.includes("/originals/")) return sizedUrl;
  const m = sizedUrl.match(PINIMG_SIZED);
  if (!m) return sizedUrl;

  for (const ext of PINTEREST_ORIGINAL_EXTS) {
    const candidate = `${m[1]}originals/${m[2]}.${ext}`;
    try {
      const res = await fetchImpl(candidate);
      // Release the connection: we only wanted the status, not the image.
      await res.body?.cancel();
      if (res.ok) return candidate;
    } catch {
      // A hiccup on one probe says nothing about the next extension.
    }
  }
  return sizedUrl;
}

export async function resolveMediaSource(
  item: { image_url: string; kind: ReferenceKind },
  deps: { fetchImpl?: typeof fetch; token?: string } = {},
): Promise<MediaSource | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  // The reference IS the media. Note this is also the cheapest real win available:
  // the extension's generic pill clips CDN image URLs that carry expiring
  // signatures, and until now nothing ever took a copy of them.
  if (item.kind === "image" || item.kind === "gif" || item.kind === "video") {
    return { url: item.image_url };
  }

  if (item.kind === "pinterest") {
    const og = await ogImage(item.image_url, fetchImpl);
    if (!og) return null;
    // The sized variant is kept as the thumbnail — it is exactly what the grid wants,
    // and it is already in hand, so the tile costs no extra request.
    return { url: await pinterestOriginal(og, fetchImpl), thumbnailUrl: og };
  }

  if (item.kind === "instagram") {
    if (!deps.token) throw new Error("Missing APIFY_TOKEN env var");
    const media = await fetchPostMedia(item.image_url, { token: deps.token, fetchImpl });
    if (!media) return null;
    // A reel archives as its video; a still post archives as its display image.
    // Either way displayUrl is the cover frame — and for Instagram that is the only
    // thumbnail source that currently works at all (0 of 62 items have one).
    const url = media.videoUrl ?? media.displayUrl;
    return url ? { url, thumbnailUrl: media.displayUrl } : null;
  }

  if (item.kind === "youtube") {
    if (!deps.token) throw new Error("Missing APIFY_TOKEN env var");
    const url = await fetchYouTubeDownload(item.image_url, { token: deps.token, fetchImpl });
    return url ? { url } : null;
  }

  // tiktok and link: no provider chosen, and an article has no media to own (D268).
  return null;
}
