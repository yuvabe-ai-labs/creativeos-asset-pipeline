// Best-effort thumbnail source per kind, in a deliberate cheapest-and-most-durable
// order (D190):
//
//   1. derived from the URL   — YouTube. Zero network calls, cannot break.
//   2. oEmbed                 — official API. Returns a thumbnail only on the TOKEN
//                               tier; tokenless Instagram omits the field entirely.
//   3. og:image               — Open Graph. One fetch, works across the open web, so
//                               a blog/article/brand-site reference gets a preview too.
//   4. display_url            — Instagram's private embed JSON. Last resort: it is the
//                               only route that survives when the post page is gated,
//                               and the only one that breaks on Meta's schedule.
//
// Every failure path returns null — capture must never fail on preview problems
// (D185); a null thumbnail renders as a link tile.
import { youtubeVideoId, embedUrlFor, isYouTubeShort } from "./classify";
import type { ReferenceKind } from "./constants";

// Tokenless oEmbed endpoints. TikTok's is long-stable; Meta re-opened tokenless
// oEmbed for single public posts/reels on 2026-06-15 (design spec §2 — verified
// 2026-08-27), though NOT with thumbnail_url. See D190.
const TIKTOK_OEMBED = "https://www.tiktok.com/oembed?url=";
const INSTAGRAM_OEMBED =
  "https://graph.facebook.com/v23.0/instagram_oembed?omit_script=true&url=";

// Some hosts serve a stripped page to unknown agents; a browser UA gets the real
// markup (and the OG tags with it).
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function oembedThumbnail(
  endpoint: string,
  url: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(endpoint + encodeURIComponent(url));
    if (!res.ok) return null;
    const json = (await res.json()) as { thumbnail_url?: string };
    return json.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

/**
 * The page's Open Graph preview image. This is the general case — it is a published
 * standard rather than one platform's internals, so it covers articles, brand sites,
 * Behance, and anything else MR pastes, not just the three platforms we name.
 */
async function ogImage(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return null;
    // Resolve protocol-relative and root-relative values against the page URL.
    return new URL(decodeEntities(m[1]), url).href;
  } catch {
    return null;
  }
}

/**
 * The cover frame from Instagram's own embed page.
 *
 * Needed because the TOKENLESS oEmbed tier returns only
 * {version, provider_name, provider_url, type, width, html} — no thumbnail_url, and
 * asking for it explicitly (`fields=thumbnail_url`) answers "Provide valid app ID".
 * Verified against the live endpoint 2026-08-27.
 *
 * Ranked below og:image because it parses Meta's private JSON shape, but kept because
 * the embed endpoint stays reachable when the post page itself is gated.
 *
 * The URL found here is a short-lived signed fbcdn link, which is fine: ingest
 * re-hosts it to GCS immediately, so expiry never reaches the shelf.
 */
async function instagramEmbedPoster(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  const embed = embedUrlFor("instagram", url);
  if (!embed) return null;
  try {
    const res = await fetchImpl(embed, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/display_url\\":\\"(.*?)\\"/);
    if (!m) return null;
    // The page embeds JSON inside a JS string, so everything is double-escaped:
    // \\uXXXX literals first, then the escaped forward slashes.
    return m[1]
      .replace(/\\\\u00([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u00([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\\\//g, "/")
      .replace(/\\\//g, "/");
  } catch {
    return null;
  }
}

export async function resolveThumbnailSource(
  url: string,
  kind: ReferenceKind,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  // The reference IS the image.
  if (kind === "image" || kind === "gif") return url;

  // Derivable with no network call at all.
  if (kind === "youtube") {
    const id = youtubeVideoId(url);
    if (!id) return null;
    // A Short is vertical, and the standard variants are all landscape — maxresdefault
    // pillarboxes it into a 16:9 frame with black bars down both sides. `oardefault`
    // ("original aspect ratio") is the true 1080x1920 frame, and it exists ONLY for
    // Shorts: verified 200 for a Short and 404 for a standard video, so the two paths
    // never collide. Note oEmbed is no help here — it returns hq2.jpg, 480x360.
    // `hqdefault` is the safe pick for standard videos: unlike maxresdefault it is
    // always generated, so ingest never has to probe for a fallback.
    return isYouTubeShort(url)
      ? `https://i.ytimg.com/vi/${id}/oardefault.jpg`
      : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  // A direct media file has no HTML to read a preview from.
  if (kind === "video") return null;

  if (kind === "tiktok") {
    const viaOembed = await oembedThumbnail(TIKTOK_OEMBED, url, fetchImpl);
    return viaOembed ?? ogImage(url, fetchImpl);
  }

  if (kind === "instagram") {
    const viaOembed = await oembedThumbnail(INSTAGRAM_OEMBED, url, fetchImpl);
    if (viaOembed) return viaOembed;
    const viaOg = await ogImage(url, fetchImpl);
    return viaOg ?? instagramEmbedPoster(url, fetchImpl);
  }

  // kind === "link": any page on the open web. og:image is what makes these visual.
  return ogImage(url, fetchImpl);
}
