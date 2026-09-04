import type { AnnotationPayload } from "./payload";

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
  return renumber([...list, draft]);
}

export function removeDraft(list: AnnotationDraft[], seq: number): AnnotationDraft[] {
  return renumber(list.filter((d) => d.seq !== seq));
}
