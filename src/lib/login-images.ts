/**
 * The login panel's photography. Twelve hand-picked Unsplash frames spanning the kinds
 * of work CreativeOS is pointed at: D2C product stills, paper craft, and woodwork —
 * made things, shot well.
 *
 * Hardcoded rather than fetched: the sign-in screen must render before the user has a
 * session, so it cannot depend on an API key, a rate limit, or a network round trip in
 * front of the login form. (Unsplash's search API needs a key — it answers 307
 * "Authorization required" — which is a second reason not to reach for it here.)
 *
 * Every URL below was checked for a 200 before being added; a plausible-looking photo
 * id is not a real one, and several candidates 404'd. Sizing params are baked in so the
 * origin fetch is bounded even though Next re-optimises the result.
 */
const UNSPLASH = "https://images.unsplash.com";
const PARAMS = "auto=format&fit=crop&w=1400&q=75";

export const LOGIN_IMAGES: readonly string[] = [
  // ── D2C product ────────────────────────────────────────────────────────────
  `${UNSPLASH}/photo-1441986300917-64674bd600d8?${PARAMS}`, // retail storefront
  `${UNSPLASH}/photo-1523275335684-37898b6baf30?${PARAMS}`, // watch, product still
  `${UNSPLASH}/photo-1505740420928-5e560c06d30e?${PARAMS}`, // headphones on colour
  `${UNSPLASH}/photo-1542291026-7eec264c27ff?${PARAMS}`, // sneaker, studio light
  `${UNSPLASH}/photo-1572635196237-14b3f281503f?${PARAMS}`, // sunglasses, editorial
  `${UNSPLASH}/photo-1585386959984-a4155224a1ad?${PARAMS}`, // fragrance, hard shadow

  // ── Paper craft / origami ──────────────────────────────────────────────────
  `${UNSPLASH}/photo-1563260797-cb5cd70254c8?${PARAMS}`, // two paper cranes, warm ground
  `${UNSPLASH}/photo-1558244402-286dd748c593?${PARAMS}`, // folded-paper geometric wall
  `${UNSPLASH}/photo-1520013817300-1f4c1cb245ef?${PARAMS}`, // yellow paper boat on blue

  // ── Woodwork / craft ───────────────────────────────────────────────────────
  `${UNSPLASH}/photo-1547609434-b732edfee020?${PARAMS}`, // workshop bench
  `${UNSPLASH}/photo-1597960194599-22929afc25b1?${PARAMS}`, // hand tools, timber
  `${UNSPLASH}/photo-1590880795696-20c7dfadacde?${PARAMS}`, // joinery detail
];

/** One frame per page load. Called from a server component, so it never hydrates twice. */
export function randomLoginImage(): string {
  return LOGIN_IMAGES[Math.floor(Math.random() * LOGIN_IMAGES.length)];
}
