import type { AnnotationPayload } from "./payload";
import { MAX_ANNOTATIONS_PER_DECISION } from "./constants";

// Re-exported from its canonical home in payload.ts — bounds became part of the wire
// shape in D248, so every importer of RegionBounds keeps working unchanged.
export type { RegionBounds } from "./payload";

// A draft is now exactly the payload: nothing is stripped at submit any more.
export type AnnotationDraft = AnnotationPayload;

const renumber = (list: AnnotationDraft[]): AnnotationDraft[] =>
  list.map((d, i) => ({ ...d, seq: i + 1 }));

export function commitDraft(
  list: AnnotationDraft[],
  draft: AnnotationDraft,
): AnnotationDraft[] {
  // The server refuses more than this per decision; holding a 21st draft only deferred that
  // refusal to Send back (BUG-003). The views also stop painting at the limit.
  if (list.length >= MAX_ANNOTATIONS_PER_DECISION) return list;
  return renumber([...list, draft]);
}

export function removeDraft(list: AnnotationDraft[], seq: number): AnnotationDraft[] {
  return renumber(list.filter((d) => d.seq !== seq));
}
