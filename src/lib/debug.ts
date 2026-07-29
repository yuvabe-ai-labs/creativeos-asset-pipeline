/**
 * Global debug-mode flag, toggled via the `?debug-mode=true` URL parameter.
 *
 * Read at call time so it always reflects the current URL — call it inside an
 * event handler (or during render) wherever a feature needs debug behavior.
 * Client-only: returns `false` during SSR, where `window` is unavailable.
 */

export const DEBUG_MODE_PARAM = "debug-mode";

export function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get(DEBUG_MODE_PARAM) === "true"
  );
}
