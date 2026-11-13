// The one public route prefix (D309). Used by the proxy test and AppHeader.
export function isPublicReviewPath(pathname: string): boolean {
  return pathname === "/r" || pathname.startsWith("/r/");
}

const SLUG_MAX = 40;
const LEGACY_TOKEN = /^[A-Za-z0-9_-]{43}$/;

// The title part of a share link: lower-case words joined by dashes, accents dropped, at most
// SLUG_MAX characters (cut at a word). Purely for the client to read — lookups ignore it (D311).
export function linkSlug(title: string, fallback = "cut"): string {
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
  return slug || fallback;
}

/** The client-facing link for one version of a review: `/r/<title-slug>-<code>-v<n>` (D311, D496).
 *  A v1 moved from a pre-version review (`legacyLink`) keeps the exact link the client already
 *  has: no suffix, and a 43-character token from before D311 stays bare. */
export function sharePathFor(
  token: string,
  title: string,
  version: { versionNo: number; legacyLink: boolean },
): string {
  const isLegacyToken = LEGACY_TOKEN.test(token) && token.length === 43;
  const base = isLegacyToken ? `/r/${token}` : `/r/${linkSlug(title)}-${token}`;
  return version.legacyLink && version.versionNo === 1 ? base : `${base}-v${version.versionNo}`;
}
