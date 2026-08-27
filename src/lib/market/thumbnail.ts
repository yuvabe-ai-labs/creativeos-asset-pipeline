// Best-effort thumbnail source per kind. Every failure path returns null — capture
// must never fail on preview problems (D185); a null thumbnail renders as a link tile.
import { youtubeVideoId } from "./classify";
import type { ReferenceKind } from "./constants";

// Tokenless oEmbed endpoints. TikTok's is long-stable; Meta re-opened tokenless
// oEmbed for single public posts/reels on 2026-06-15 (design spec §2 — verified
// 2026-08-27). If Meta's tokenless route needs an adjustment at runtime, the
// failure mode is already the degraded tile, not an error.
const TIKTOK_OEMBED = "https://www.tiktok.com/oembed?url=";
const INSTAGRAM_OEMBED =
  "https://graph.facebook.com/v23.0/instagram_oembed?omit_script=true&url=";

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

export async function resolveThumbnailSource(
  url: string,
  kind: ReferenceKind,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (kind === "image" || kind === "gif") return url;
  if (kind === "youtube") {
    const id = youtubeVideoId(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  }
  if (kind === "tiktok") return oembedThumbnail(TIKTOK_OEMBED, url, fetchImpl);
  if (kind === "instagram") return oembedThumbnail(INSTAGRAM_OEMBED, url, fetchImpl);
  return null; // video, link — no derivable preview
}
