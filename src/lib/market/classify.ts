// Pure URL classification for market references. No fetches here — everything
// derivable from the string alone, so it runs identically in routes and tests.
import type { ReferenceKind } from "./constants";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);

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
  if (host === "instagram.com" && /^\/(p|reel|tv)\/[^/]+/.test(u.pathname)) {
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
      const m = u.pathname.match(/^\/(p|reel|tv)\/([^/]+)/);
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
