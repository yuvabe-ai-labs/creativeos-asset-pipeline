// The one public route prefix (D309). Used by the proxy test and AppHeader.
export function isPublicReviewPath(pathname: string): boolean {
  return pathname === "/r" || pathname.startsWith("/r/");
}

const SLUG_MAX = 40;
const LEGACY_TOKEN = /^[A-Za-z0-9_-]{43}$/;

// The title part of a share link: lower-case words joined by dashes, accents dropped, at most
// SLUG_MAX characters (cut at a word). Purely for the client to read — lookups ignore it (D311).
function linkSlug(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = "";
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if (next.length > SLUG_MAX) break;
    slug = next;
  }
  return slug || "cut";
}

/** The client-facing link for a review: `/r/<title-slug>-<code>` (D311). Links minted before
 *  D311 carry a 43-character token and stay exactly as they were. */
export function sharePathFor(token: string, title: string): string {
  if (LEGACY_TOKEN.test(token) && token.length === 43) return `/r/${token}`;
  return `/r/${linkSlug(title)}-${token}`;
}
