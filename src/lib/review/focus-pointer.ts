// The `?node=` pointer on a canvas URL (a navbar-inbox link — D165 / R9.3) names the one
// asset to fly to and open. The review drawer used to latch that pointer once per MOUNT,
// which broke it in two ways that only showed up on the canvas you were already looking at:
//
//   - Following a second pointer to the SAME canvas is a soft navigation. Nothing remounts
//     (the store provider is keyed on canvas id), so a mount-scoped latch swallowed every
//     pointer after the first — the asset simply never opened. Cross-canvas links looked
//     fine only because the remount handed them a fresh latch. Latch on the pointer's VALUE
//     and the second link behaves like the first.
//
//   - Closing the focus view left `?node=` in the URL. The URL then described a screen that
//     was no longer on it, and re-clicking that same inbox row produced a byte-identical
//     href — a navigation the router drops — so that asset could never be reopened at all.
//
// `?review=1` is the same kind of param and gets the same treatment: both are ARRIVAL
// INSTRUCTIONS — open the drawer, open that asset — not a description of the canvas. Once
// obeyed they are spent, so the surface that obeyed them clears them when it closes, and the
// URL goes back to naming just the canvas you are on.

/** True when the URL's pointer is one this drawer has not acted on yet. */
export function isUnhandledPointer(
  pointer: string | null,
  handled: string | null,
): boolean {
  return !!pointer && pointer !== handled;
}

/**
 * The same URL with the named query params removed, as a path+query+hash string ready for
 * `history.replaceState`. Returns null when none of them are present, so the caller can skip
 * the history write entirely rather than replacing an entry with itself.
 */
export function urlWithoutParams(url: string, params: string[]): string | null {
  const parsed = new URL(url);
  const present = params.filter((p) => parsed.searchParams.has(p));
  if (present.length === 0) return null;
  for (const p of present) parsed.searchParams.delete(p);
  const search = parsed.searchParams.toString();
  return `${parsed.pathname}${search ? `?${search}` : ""}${parsed.hash}`;
}
