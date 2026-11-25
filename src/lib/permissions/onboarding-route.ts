// Spec §2.4 / §4.4: where a waiting person may still go. Shared by the root layout (a full page
// load, path from the proxy's header) and the browser guard (soft navigations, which never
// re-render the root layout). No server-only imports: both sides use it.

export const ONBOARDING_PATH = "/onboarding";

/** The request header the proxy sets so the root layout knows the path it renders for. */
export const PATHNAME_HEADER = "x-pathname";

// Onboarding itself, invites, sign-in and auth, the account pages (a password change owed sends
// everyone there), the public review pages, and APIs (they keep their own 404s).
const OPEN_PREFIXES = [ONBOARDING_PATH, "/invite", "/login", "/auth", "/account", "/r", "/api"];

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** True when the browser is loading a whole page, the only time the root layout may redirect.
 *  Any other render of the layout is RSC (a soft navigation, router.refresh(), a server action or
 *  the page rendered for its redirect), and the browser keeps that root layout and never
 *  re-renders it on later navigations: a redirect thrown there would re-throw on every one, so
 *  the browser would re-request the target forever. Next hides its RSC headers from the proxy;
 *  only a page load asks for HTML. */
export function isPageLoad(headers: Headers): boolean {
  return !headers.has("next-action") && (headers.get("accept") ?? "").includes("text/html");
}

/** True when this page should send the person to onboarding. Super admins are never waiting,
 *  so /admin stays open to them. */
export function shouldSendToOnboarding(path: string | null, waiting: boolean): boolean {
  if (!waiting || !path) return false;
  return !OPEN_PREFIXES.some((p) => under(path, p));
}

/** The browser guard: the cached payload says waiting, so confirm on a fresh read before sending
 *  (performance rule 10). Otherwise a stale payload and the onboarding page's own "not waiting,
 *  go home" would bounce the person between the two. A failed read is never "waiting". */
export async function confirmAndSendToOnboarding(
  path: string | null,
  waiting: boolean,
  readStillWaiting: () => Promise<boolean>,
  go: () => void,
): Promise<void> {
  if (!shouldSendToOnboarding(path, waiting)) return;
  let still = false;
  try {
    still = await readStillWaiting();
  } catch {
    return;
  }
  if (still) go();
}
