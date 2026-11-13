// D311: a share link is `/r/<title-slug>-<code>`. The code is the first 4 hex characters of the
// node id (one more per collision — the unique share_token column decides), so links are short
// and readable. The operator accepted that this makes links guessable (D311 supersedes D309's
// unguessable-capability premise). The title slug is decoration: lookups use only the code,
// so renaming a cut never breaks a link a client already has.
//
// Pure (no crypto, no server-only) — the drawer and the page both build and parse links.

const CODE_MIN = 4;
const CODE_MAX = 32;
const LEGACY_TOKEN = /^[A-Za-z0-9_-]{43}$/; // links minted before D311
const TITLED_CODE = new RegExp(`^(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?([0-9a-f]{${CODE_MIN},${CODE_MAX}})$`);

/** The code for a node, `extra` characters longer than the minimum (for collisions). */
export function shareCodeFor(nodeId: string, extra = 0): string {
  return nodeId.replace(/-/g, "").slice(0, CODE_MIN + extra).toLowerCase();
}

export const MAX_CODE_EXTRA = CODE_MAX - CODE_MIN;

/** The stored share_token a link points at, or null when the link can't be one. Never touches
 *  the database, so a mangled link costs nothing. */
export function toCanonicalShareToken(raw: string): string | null {
  // A legacy token is case-sensitive base64url; check it before lower-casing.
  if (LEGACY_TOKEN.test(raw) && !TITLED_CODE.test(raw.toLowerCase())) return raw;
  const m = TITLED_CODE.exec(raw.toLowerCase());
  return m ? m[1] : null;
}

const VERSION_SUFFIX = /-v([1-9][0-9]{0,3})$/i;
const LEGACY_LENGTH = 43;

/** D496 — a cut review link names a version: `<title-slug>-<code>-v<n>`. A link with no
 *  suffix is v1, so every link sent before versions keeps opening the cut it showed. A legacy
 *  43-character token takes the same suffix. Script reviews keep `toCanonicalShareToken`. */
export function parseReviewLink(raw: string): { token: string; versionNo: number } | null {
  const m = VERSION_SUFFIX.exec(raw);
  const base = m ? raw.slice(0, m.index) : raw;
  const versionNo = m ? Number(m[1]) : 1;
  // A titled link first: one can be 43 characters long by chance (a 35-character slug, a
  // 4-character code and "-v2"), and must not be read as a legacy token.
  const titled = TITLED_CODE.exec(base.toLowerCase());
  if (titled) return { token: titled[1], versionNo };
  // A bare legacy token can itself end in "-v<digit>"; it is exactly 43 characters.
  if (raw.length === LEGACY_LENGTH && LEGACY_TOKEN.test(raw)) return { token: raw, versionNo: 1 };
  const token = toCanonicalShareToken(base);
  return token ? { token, versionNo } : null;
}
