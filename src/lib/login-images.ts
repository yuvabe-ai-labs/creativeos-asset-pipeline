/**
 * The login panel's photography. Nine hand-picked Unsplash frames on a design /
 * creative / D2C-product theme — the work CreativeOS is used to make.
 *
 * Hardcoded rather than fetched: the sign-in screen must render before the user has a
 * session, so it cannot depend on an API key, a rate limit, or a network round trip in
 * front of the login form. Sizing params are baked into the URL so the origin fetch is
 * bounded even though Next re-optimises the result.
 */
const UNSPLASH = "https://images.unsplash.com";
const PARAMS = "auto=format&fit=crop&w=1400&q=75";

export const LOGIN_IMAGES: readonly string[] = [
  `${UNSPLASH}/photo-1441986300917-64674bd600d8?${PARAMS}`, // retail storefront
  `${UNSPLASH}/photo-1523275335684-37898b6baf30?${PARAMS}`, // watch, product still
  `${UNSPLASH}/photo-1505740420928-5e560c06d30e?${PARAMS}`, // headphones on colour
  `${UNSPLASH}/photo-1542291026-7eec264c27ff?${PARAMS}`, // sneaker, studio light
  `${UNSPLASH}/photo-1572635196237-14b3f281503f?${PARAMS}`, // sunglasses, editorial
  `${UNSPLASH}/photo-1596462502278-27bfdc403348?${PARAMS}`, // skincare flatlay
  `${UNSPLASH}/photo-1571781926291-c477ebfd024b?${PARAMS}`, // cosmetics, colour block
  `${UNSPLASH}/photo-1560343090-f0409e92791a?${PARAMS}`, // bag, minimal set
  `${UNSPLASH}/photo-1585386959984-a4155224a1ad?${PARAMS}`, // fragrance, hard shadow
];

/** One frame per page load. Called from a server component, so it never hydrates twice. */
export function randomLoginImage(): string {
  return LOGIN_IMAGES[Math.floor(Math.random() * LOGIN_IMAGES.length)];
}
