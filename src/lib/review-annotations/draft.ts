import type { AnnotationPayload } from "./payload";

// Bounding box of the painted stroke in FRACTIONS of the media's natural size —
// resolution-independent, so the pin renders correctly at any display scale.
export type RegionBounds = { x: number; y: number; w: number; h: number };

export type AnnotationDraft = AnnotationPayload & { bounds: RegionBounds | null };

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
