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

/** First occurrence of each ref wins. */
export function dedupeByRef(assets: ScrapedAsset[]): ScrapedAsset[] {
  const seen = new Set<string>();
  return assets.filter((a) => {
    if (seen.has(a.ref)) return false;
    seen.add(a.ref);
    return true;
  });
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
