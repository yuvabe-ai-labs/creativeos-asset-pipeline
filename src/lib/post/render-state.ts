export type RenderState = "draft" | "exported" | "stale";

export const RENDER_STATE_LABELS: Record<RenderState, string> = {
  draft: "Draft",
  exported: "Exported",
  stale: "Edited since export",
};

function parseTime(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * What the node card should say about a post (D126).
 *
 * The old chip read `!!fileUrl` and said "Rendered"/"Pending" — i.e. "has this ever been
 * exported?", not "is this ready?". A finished design you hadn't downloaded read *Pending*,
 * and an edited-since-export design read *Rendered*, which was simply false.
 *
 * Absent timestamps are treated as "current", never as stale: every node saved before
 * `layersUpdatedAt` existed lacks it, and defaulting those to stale would flag every
 * previously-exported post as dirty the first time it loaded.
 */
export function renderState(args: {
  fileUrl?: string;
  renderedAt?: string;
  layersUpdatedAt?: string;
}): RenderState {
  if (!args.fileUrl) return "draft";
  const rendered = parseTime(args.renderedAt);
  const edited = parseTime(args.layersUpdatedAt);
  if (rendered === null || edited === null) return "exported";
  return edited > rendered ? "stale" : "exported";
}
