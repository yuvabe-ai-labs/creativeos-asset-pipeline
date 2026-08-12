import { chapterBySlug } from "@/lib/help/chapters";

/** `step` is a page index: 0 is the map page, 1..n are the content steps. */
export type HelpLocation = { slug: string; step: number };

const HELP_PARAM = "help";
const STEP_PARAM = "step";

/**
 * Read a help location out of URL params. Returns null — a closed dialog — for anything
 * unusable, so a stale or hand-edited link degrades to "no modal" rather than throwing.
 */
export function parseHelpParams(params: URLSearchParams): HelpLocation | null {
  const slug = params.get(HELP_PARAM);
  if (!slug) return null;

  const chapter = chapterBySlug(slug);
  // Draft chapters are unrecorded, so their clips 404 — not linkable until they ship.
  if (!chapter || chapter.draft) return null;

  const raw = Number(params.get(STEP_PARAM));
  if (!Number.isFinite(raw)) return { slug, step: 0 };

  const step = Math.min(Math.max(Math.trunc(raw), 0), chapter.steps.length);
  return { slug, step };
}

/** Build the query string for a location. The map page is the bare chapter link. */
export function helpParamsFor(slug: string, step: number): string {
  const params = new URLSearchParams({ [HELP_PARAM]: slug });
  if (step > 0) params.set(STEP_PARAM, String(step));
  return `?${params.toString()}`;
}
