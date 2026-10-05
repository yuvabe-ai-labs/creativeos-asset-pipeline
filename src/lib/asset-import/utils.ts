import { SOCIAL_WINDOW_MONTHS } from "./constants";
import type { ScrapedAsset } from "./types";

// ── Targets ──────────────────────────────────────────────────────────────────
// People type a handle every way there is: "@chuppslife", "chuppslife", "instagram.com/chuppslife",
// a full URL with a trailing query. All of them mean the same profile.

const HANDLE_RE = /^[A-Za-z0-9._-]+$/;

function socialHandle(input: string | null | undefined, host: string): string | null {
  let value = (input ?? "").trim();
  if (!value) return null;
  value = value.replace(/^@/, "");
  if (value.includes(host) || /^https?:\/\//i.test(value)) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!url.hostname.endsWith(host)) return null;
      value = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  value = value.replace(/^\/+|\/+$/g, "");
  return HANDLE_RE.test(value) ? value : null;
}

/** The Instagram profile URL a handle means, or null when it cannot be one. */
export function instagramProfileUrl(input: string | null | undefined): string | null {
  const handle = socialHandle(input, "instagram.com");
  return handle ? `https://www.instagram.com/${handle}/` : null;
}

/** The Facebook page URL a handle means, or null when it cannot be one. */
export function facebookPageUrl(input: string | null | undefined): string | null {
  const handle = socialHandle(input, "facebook.com");
  return handle ? `https://www.facebook.com/${handle}/` : null;
}

/** A website URL to crawl, or null. A bare domain gets https://. */
export function websiteUrl(input: string | null | undefined): string | null {
  const value = (input ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

/** A target as people read it: "instagram.com/cocacola", "chupps.com". */
export function importTargetLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

/** What the handle field starts with when editing a target: a social handle alone (the field
 *  shows the domain as its prefix), a website as its label. */
export function importTargetEditValue(source: "website" | "instagram" | "facebook", url: string | null): string {
  if (!url) return "";
  if (source === "website") return importTargetLabel(url);
  try {
    return new URL(url).pathname.split("/").filter(Boolean)[0] ?? "";
  } catch {
    return "";
  }
}

// ── Refs (D305) ──────────────────────────────────────────────────────────────

/**
 * The Meta CDN filename of an Instagram or Facebook media URL — identical on both platforms for
 * the same upload, so a cross-post shares it. Falls back to the query-less URL.
 */
export function metaMediaRef(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").pop() ?? "";
    if (/^\d+_\d+_\d+_n\.\w+$/.test(name)) return `meta:${name}`;
  } catch {
    // fall through
  }
  return urlRef(url);
}

/** A URL without its query string — every CDN rendition of one file shares it. */
export function urlRef(url: string): string {
  try {
    const u = new URL(url);
    return `url:${u.host}${u.pathname}`;
  } catch {
    return `url:${url}`;
  }
}

/**
 * Facebook serves post photos at a display size (`ctp=s590x590`). Without `ctp` the same signed
 * URL serves the original — verified 2026-10-05, 24 KB → 635 KB (D304).
 */
export function stripFacebookDisplaySize(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("ctp");
    return u.href;
  } catch {
    return url;
  }
}

// ── Window and dedupe ────────────────────────────────────────────────────────

/** The oldest post time the import keeps. */
export function windowStart(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setMonth(start.getMonth() - SOCIAL_WINDOW_MONTHS);
  return start;
}

/** True when a post falls inside the window. Pinned posts arrive regardless of age, so the
 *  actor's own date filter is not enough. A post with no time is kept. */
export function isWithinWindow(postedAt: string | undefined, now: Date = new Date()): boolean {
  if (!postedAt) return true;
  const t = Date.parse(postedAt);
  return Number.isNaN(t) || t >= windowStart(now).getTime();
}

/** A refresh re-reads this much before the last import, so a post published while that import
 *  ran — or timestamped a little differently by the actor — is never missed. */
const REFRESH_OVERLAP_MS = 24 * 60 * 60 * 1000;

/**
 * The date (YYYY-MM-DD) a social refresh fetches posts from: just before the last successful
 * import of the same target, never earlier than the 3-month window. Null — fetch the whole
 * window — when there is no earlier success to build on.
 */
export function refreshSince(lastSucceededAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!lastSucceededAt) return null;
  const last = Date.parse(lastSucceededAt);
  if (Number.isNaN(last)) return null;
  const since = Math.max(last - REFRESH_OVERLAP_MS, windowStart(now).getTime());
  return new Date(since).toISOString().slice(0, 10);
}

/** First occurrence of each ref wins. */
export function dedupeByRef(assets: ScrapedAsset[]): ScrapedAsset[] {
  const seen = new Set<string>();
  return assets.filter((a) => {
    if (seen.has(a.ref)) return false;
    seen.add(a.ref);
    return true;
  });
}

// ── Website renditions ───────────────────────────────────────────────────────
// CMSs put an image's display size in the PATH, not the query, so the website actor's variant
// merging (query params and srcset) misses them. Seen on coca-cola.com (Adobe AEM):
// `…/banner-mo.png/width3840.png`, `/width2674.png`, `/width1960.png` — one banner, five rows.

const RENDITION_PATTERNS: RegExp[] = [
  /(\.[a-z0-9]+)\/width\d+\.[a-z0-9]+$/i, // AEM:        name.png/width3840.png → name.png
  /\.coreimg(?:\.\d+)*(\.[a-z0-9]+)(?:\/.*)?$/i, // AEM core: name.coreimg.85.1024.jpeg → name.jpeg
  /-\d{2,5}x\d{2,5}(\.[a-z0-9]+)$/i, // WordPress:  name-300x200.jpg → name.jpg
  /_\d{2,5}x\d{0,5}(\.[a-z0-9]+)$/i, // Shopify:    name_1080x.jpg, name_640x480.jpg → name.jpg
  /@\dx(\.[a-z0-9]+)$/i, // retina:     name@2x.png → name.png
];

/** The dedupe key of a website asset: its URL without query string or path-embedded size. */
export function websiteMediaRef(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname;
    for (const re of RENDITION_PATTERNS) path = path.replace(re, "$1");
    return `url:${u.host}${path}`;
  } catch {
    return urlRef(url);
  }
}

/** The pixel width a rendition URL names, when it names one — used to keep the largest. */
export function renditionWidth(url: string): number | null {
  const m = url.match(/\/width(\d+)\.|\.coreimg(?:\.\d+)?\.(\d+)\.|-(\d{2,5})x\d{2,5}\.|_(\d{2,5})x\d{0,5}\.|[?&](?:width|w)=(\d+)/i);
  const n = m ? Number(m.slice(1).find(Boolean)) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ── Page cursors ─────────────────────────────────────────────────────────────
// Keyset pagination over (sort_at desc, id desc): the cursor is the last row's pair, opaque to
// the browser. Unlike an offset it stays correct while an import inserts rows mid-scroll.

export type AssetCursor = { sortAt: string; id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeAssetCursor(cursor: AssetCursor): string {
  return Buffer.from(JSON.stringify([cursor.sortAt, cursor.id])).toString("base64url");
}

/** The cursor, or null when it is missing, tampered with or malformed. */
export function decodeAssetCursor(value: string | null | undefined): AssetCursor | null {
  if (!value) return null;
  try {
    const [sortAt, id] = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown[];
    if (typeof sortAt !== "string" || Number.isNaN(Date.parse(sortAt))) return null;
    if (typeof id !== "string" || !UUID_RE.test(id)) return null;
    return { sortAt, id };
  } catch {
    return null;
  }
}

// ── Stored names ─────────────────────────────────────────────────────────────

/** A readable filename for an imported asset's row and storage path. */
export function importedFilename(asset: ScrapedAsset, ext: string): string {
  let base = "";
  try {
    base = decodeURIComponent(new URL(asset.url).pathname.split("/").pop() ?? "");
  } catch {
    // fall through
  }
  base = base.replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60);
  return `${asset.source}-${base || asset.mediaType}.${ext}`;
}
