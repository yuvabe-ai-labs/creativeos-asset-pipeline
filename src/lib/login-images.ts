/**
 * The login panel's photography: **rooms where things get made**.
 *
 * The brief is a threshold, not a catalogue — signing in should feel like stepping into
 * a workshop or studio. So these are spaces with evidence of work in them (benches,
 * offcuts, wet clay, loaded brushes), not product packshots. A lit hero shot of a
 * finished object sells the object; a studio says "your work happens here", which is
 * the thing a sign-in screen should say.
 *
 * Hardcoded rather than fetched: the sign-in screen must render before the user has a
 * session, so it cannot depend on an API key, a rate limit, or a network round trip in
 * front of the login form. (Unsplash's search API answers 307 "Authorization required"
 * without a key — a second reason not to reach for it at runtime.)
 *
 * Every URL below was checked for a 200 before landing; plausible-looking photo ids are
 * frequently not real ones. Sizing params are baked in so the origin fetch is bounded
 * even though Next re-optimises the result.
 */
const UNSPLASH = "https://images.unsplash.com";
const PARAMS = "auto=format&fit=crop&w=1400&q=75";

export const LOGIN_IMAGES: readonly string[] = [
  // ── Wood shops / carpentry ─────────────────────────────────────────────────
  `${UNSPLASH}/photo-1546964432-2ca7fcd08632?${PARAMS}`,
  `${UNSPLASH}/photo-1605125626499-e2c7efbd1ab3?${PARAMS}`,
  `${UNSPLASH}/photo-1547609434-b732edfee020?${PARAMS}`,
  `${UNSPLASH}/photo-1597960194599-22929afc25b1?${PARAMS}`,
  `${UNSPLASH}/photo-1590880795696-20c7dfadacde?${PARAMS}`,

  // ── Painters' and artists' studios ─────────────────────────────────────────
  `${UNSPLASH}/photo-1459908676235-d5f02a50184b?${PARAMS}`,
  `${UNSPLASH}/photo-1534511902651-6ab0ce131f2a?${PARAMS}`,
  `${UNSPLASH}/photo-1613574714687-c33b9e90200d?${PARAMS}`,
  `${UNSPLASH}/photo-1601397210737-a5534480bdc5?${PARAMS}`,
  `${UNSPLASH}/photo-1526389157-6a5cc2bb4afa?${PARAMS}`,

  // ── Ceramics / pottery studios ─────────────────────────────────────────────
  `${UNSPLASH}/photo-1595351298020-038700609878?${PARAMS}`,
  `${UNSPLASH}/photo-1610206349499-c932c3b3aacb?${PARAMS}`,
  `${UNSPLASH}/photo-1572853566597-b83cde546912?${PARAMS}`,
  `${UNSPLASH}/photo-1528466829416-7c2576152a09?${PARAMS}`,
];

/** One frame per page load. Called from a server component, so it never hydrates twice. */
export function randomLoginImage(): string {
  return LOGIN_IMAGES[Math.floor(Math.random() * LOGIN_IMAGES.length)];
}
