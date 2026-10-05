// Actor output → ScrapedAsset[]. Pure, so each shape is pinned by a test against real output
// captured in the 2026-10-05 benchmark (__fixtures__/). Field names are what the actors actually
// return, several of which their docs never mention.
import { MIN_IMAGE_SIDE_PX } from "./constants";
import type { NormalizeResult, ScrapedAsset } from "./types";
import {
  dedupeByRef,
  isWithinWindow,
  metaMediaRef,
  stripFacebookDisplaySize,
  urlRef,
} from "./utils";

type ErrorRow = { error?: string; errorDescription?: string };

const ERROR_MESSAGES: Record<string, string> = {
  not_available: "This page isn't public, so its posts can't be imported.",
  not_found: "We couldn't find this page — check the handle.",
  // Also what an inactive page returns: the actor finds nothing inside the 3-month window.
  no_items: "No posts in the last 3 months.",
};

/** When every row is an error row, the source produced nothing — say why. */
function errorOf(rows: ErrorRow[]): string | undefined {
  if (rows.length === 0 || !rows.every((r) => r.error)) return undefined;
  const first = rows[0];
  return ERROR_MESSAGES[first.error!] ?? first.errorDescription ?? first.error;
}

// ── Instagram (apify/instagram-scraper, resultsType "posts") ────────────────

type InstagramMedia = {
  type?: string;
  displayUrl?: string;
  videoUrl?: string;
  alt?: string | null;
};
type InstagramPost = InstagramMedia &
  ErrorRow & { url?: string; timestamp?: string; childPosts?: InstagramMedia[] };

export function normalizeInstagram(rows: InstagramPost[], now: Date = new Date()): NormalizeResult {
  const error = errorOf(rows);
  if (error) return { assets: [], error };

  const assets: ScrapedAsset[] = [];
  for (const post of rows) {
    if (post.error || !isWithinWindow(post.timestamp, now)) continue;
    // A carousel's own displayUrl repeats its first slide — the slides are the assets.
    const media = post.childPosts?.length ? post.childPosts : [post];
    for (const m of media) {
      const base = { source: "instagram" as const, sourceUrl: post.url, postedAt: post.timestamp, alt: m.alt ?? undefined };
      if (m.videoUrl) {
        // Keyed on the poster: the video file differs between Instagram and Facebook for the same
        // reel, the poster's filename does not (D305, verified on 5 of 6 Blue Tokai reels).
        assets.push({
          ...base,
          mediaType: "video",
          url: m.videoUrl,
          thumbnailUrl: m.displayUrl,
          ref: metaMediaRef(m.displayUrl ?? m.videoUrl),
        });
      } else if (m.displayUrl) {
        assets.push({ ...base, mediaType: "image", url: m.displayUrl, ref: metaMediaRef(m.displayUrl) });
      }
    }
  }
  return { assets: dedupeByRef(assets) };
}

// ── Facebook (apify/facebook-posts-scraper) ─────────────────────────────────

type FacebookMedia = {
  __typename?: string;
  thumbnail?: string;
  image?: { uri?: string };
  thumbnailImage?: { uri?: string };
  videoDeliveryLegacyFields?: { browser_native_hd_url?: string | null; browser_native_sd_url?: string | null };
};
type FacebookPost = ErrorRow & { url?: string; time?: string; media?: FacebookMedia[] };

export function normalizeFacebook(rows: FacebookPost[], now: Date = new Date()): NormalizeResult {
  const error = errorOf(rows);
  if (error) return { assets: [], error };

  const assets: ScrapedAsset[] = [];
  for (const post of rows) {
    if (post.error || !isWithinWindow(post.time, now)) continue;
    for (const m of post.media ?? []) {
      const base = { source: "facebook" as const, sourceUrl: post.url, postedAt: post.time };
      const still = m.image?.uri ?? m.thumbnailImage?.uri ?? m.thumbnail;
      if (m.__typename === "Video") {
        const video = m.videoDeliveryLegacyFields?.browser_native_hd_url ?? m.videoDeliveryLegacyFields?.browser_native_sd_url;
        // An album's video carries only a poster frame — skipped rather than stored as a photo (D304).
        if (!video) continue;
        assets.push({
          ...base,
          mediaType: "video",
          url: video,
          thumbnailUrl: still ? stripFacebookDisplaySize(still) : undefined,
          // The poster's filename is the one Instagram shares for the same reel (D305).
          ref: metaMediaRef(still ?? video),
        });
      } else if (m.__typename === "Photo" && still) {
        assets.push({ ...base, mediaType: "image", url: stripFacebookDisplaySize(still), ref: metaMediaRef(still) });
      }
    }
  }
  return { assets: dedupeByRef(assets) };
}

// ── Website (logiover/website-image-media-extractor) ────────────────────────

type WebsiteMedia = ErrorRow & {
  pageUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileExtension?: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
};

const WEB_IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"]);
const WEB_VIDEO_EXT = new Set(["mp4", "webm", "mov"]);

export function normalizeWebsite(rows: WebsiteMedia[]): NormalizeResult {
  const error = errorOf(rows);
  if (error) return { assets: [], error };

  const assets: ScrapedAsset[] = [];
  for (const row of rows) {
    if (row.error || !row.mediaUrl || row.mediaUrl.startsWith("data:")) continue;
    const ext = (row.fileExtension ?? "").toLowerCase();
    const base = { source: "website" as const, url: row.mediaUrl, sourceUrl: row.pageUrl, alt: row.alt ?? undefined, ref: urlRef(row.mediaUrl) };

    if (row.mediaType === "video" && WEB_VIDEO_EXT.has(ext)) {
      assets.push({ ...base, mediaType: "video" });
      continue;
    }
    // Favicons arrive as "icon"; tracking pixels as 1×1 images with a .htm "extension".
    if (row.mediaType !== "image" || !WEB_IMAGE_EXT.has(ext)) continue;
    // A vector logo is drawn small and is still the logo — size says nothing about an SVG.
    if (ext !== "svg" && isSmall(row.width, row.height)) continue;
    assets.push({ ...base, mediaType: "image" });
  }
  return { assets: dedupeByRef(assets) };
}

function isSmall(width?: number | null, height?: number | null): boolean {
  const sides = [width, height].filter((v): v is number => typeof v === "number" && v > 0);
  return sides.length > 0 && sides.every((v) => v < MIN_IMAGE_SIDE_PX);
}
