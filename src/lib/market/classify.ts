// Pure URL classification for market references. No fetches here — everything
// derivable from the string alone, so it runs identically in routes and tests.
import type { ReferenceKind } from "./constants";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);

// Both Instagram permalink shapes: the classic /reel/<id> and the newer
// username-prefixed /<username>/reel/<id>. The optional segment cannot
// false-match /reels/ (browse) or /stories/… — those never have p|reel|tv
// as the segment before the id.
const IG_PERMALINK = /^\/(?:[^/]+\/)?(p|reel|tv)\/([^/]+)/;

function ext(pathname: string): string {
  return pathname.split(".").pop()?.toLowerCase() ?? "";
}

export function classifyUrl(url: string): ReferenceKind {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "link";
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    return youtubeVideoId(url) ? "youtube" : "link";
  }
  if (host === "instagram.com" && IG_PERMALINK.test(u.pathname)) {
    return "instagram";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";

  const e = ext(u.pathname);
  if (e === "gif") return "gif";
  if (IMAGE_EXTS.has(e)) return "image";
  if (VIDEO_EXTS.has(e)) return "video";
  return "link";
}

export function youtubeVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com" && host !== "m.youtube.com") return null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const shorts = u.pathname.match(/^\/shorts\/([^/]+)/);
  return shorts ? shorts[1] : null;
}

/**
 * True for a YouTube Short. Shorts are vertical (9:16), so a player sized for a
 * standard 16:9 video would letterbox them into black bars. The embed URL is the
 * same for both — only the frame differs.
 */
export function isYouTubeShort(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return (host === "youtube.com" || host === "m.youtube.com") && u.pathname.startsWith("/shorts/");
  } catch {
    return false;
  }
}

/**
 * Iframe src for the lightbox player, or null when playback isn't derivable —
 * the caller then falls back to "open source in a new tab" (D185's degraded path).
 * Direct iframe endpoints, not the platforms' embed.js, so no third-party script
 * runs in the app (design spec §8 Q2).
 */
export function embedUrlFor(kind: ReferenceKind, url: string): string | null {
  if (kind === "youtube") {
    const id = youtubeVideoId(url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (kind === "instagram") {
    try {
      const u = new URL(url);
      // The /embed endpoint only exists on the classic shape, so the
      // username prefix is stripped when present.
      const m = u.pathname.match(IG_PERMALINK);
      return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null;
    } catch {
      return null;
    }
  }
  if (kind === "tiktok") {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\/video\/(\d+)/);
      return m ? `https://www.tiktok.com/embed/v2/${m[1]}` : null;
    } catch {
      return null;
    }
  }
  return null;
}
