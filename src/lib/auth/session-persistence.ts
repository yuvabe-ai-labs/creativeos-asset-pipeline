/**
 * "Remember me" — whether the Supabase auth cookies outlive the browser session.
 *
 * A cookie with no `maxAge`/`expires` is a *session cookie*: the browser drops it when
 * it closes. That is the whole mechanism here. Supabase always issues its auth cookies
 * with a long `maxAge`, so opting out means stripping those two fields as the cookies
 * are written.
 *
 * The catch that makes this a shared module rather than three lines in the login action:
 * `proxy.ts` re-writes the auth cookies on *every* request to keep the session fresh,
 * using the options Supabase hands it. Strip the expiry only at sign-in and the next
 * request silently restores a persistent cookie — "remember me: off" would quietly mean
 * "remembered". So the choice is recorded in its own cookie and both writers consult it.
 */

/** Records the user's choice so `proxy.ts` can honour it on every later refresh. */
export const REMEMBER_COOKIE = "creativeos-remember";

/** A year. Only ever applied to the preference cookie, never to Supabase's own. */
export const REMEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Defaults to true for any absent or unrecognised value. Before this feature every
 * session was persistent, so an unset cookie must keep behaving that way — a missing
 * preference should never silently log a working user out when their browser closes.
 */
export function shouldPersistSession(cookieValue: string | undefined): boolean {
  return cookieValue !== "0";
}

/** The value to store for a given choice. */
export function rememberCookieValue(persist: boolean): "1" | "0" {
  return persist ? "1" : "0";
}

type ExpiringCookieOptions = {
  maxAge?: number;
  expires?: Date | number | string;
  [key: string]: unknown;
};

/**
 * Returns the cookie options to actually write. When persisting, they pass through
 * untouched. When not, `maxAge` and `expires` are removed — both, because either one
 * alone is enough to make the cookie outlive the browser session.
 */
export function applySessionPersistence<T extends ExpiringCookieOptions>(
  options: T | undefined,
  persist: boolean,
): Partial<T> {
  const base = options ?? ({} as T);
  if (persist) return base;
  const { maxAge: _maxAge, expires: _expires, ...rest } = base;
  return rest as Partial<T>;
}
