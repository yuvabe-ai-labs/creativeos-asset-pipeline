import { chapterBySlug } from "@/lib/help/chapters";

/** `step` is 1-based: 1 is the first step. There is no page 0 — the rail shows the shape. */
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
  if (!Number.isFinite(raw)) return { slug, step: 1 };

  const step = Math.min(Math.max(Math.trunc(raw), 1), chapter.steps.length);
  return { slug, step };
}

/** Build the query string for a location. The first step is the bare chapter link. */
export function helpParamsFor(slug: string, step: number): string {
  const params = new URLSearchParams({ [HELP_PARAM]: slug });
  if (step > 1) params.set(STEP_PARAM, String(step));
  return `?${params.toString()}`;
}
