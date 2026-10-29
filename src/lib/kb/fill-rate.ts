import type { TraceableBrandKB, KBField } from "./schema";

function isFieldFilled(field: KBField<unknown>): boolean {
  if (field.value === null || field.value === undefined) return false;
  if (Array.isArray(field.value)) return field.value.length > 0;
  return true;
}

function countFields(
  section: Record<string, KBField<unknown>>,
): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const field of Object.values(section)) {
    total++;
    if (isFieldFilled(field)) filled++;
  }
  return { filled, total };
}

// The sections the KB build writes from the website and documents.
function documentSections(kb: TraceableBrandKB): Record<string, KBField<unknown>>[] {
  return [
    kb.brand_profile as unknown as Record<string, KBField<unknown>>,
    kb.visual_identity as unknown as Record<string, KBField<unknown>>,
    kb.target_audience as unknown as Record<string, KBField<unknown>>,
    kb.creative_direction.image as unknown as Record<string, KBField<unknown>>,
    kb.creative_direction.video as unknown as Record<string, KBField<unknown>>,
    kb.compliance as unknown as Record<string, KBField<unknown>>,
  ];
}

function allSections(kb: TraceableBrandKB): Record<string, KBField<unknown>>[] {
  return [
    ...documentSections(kb),
    kb.image_analysis as unknown as Record<string, KBField<unknown>>,
  ];
}

export function computeFillRate(kb: TraceableBrandKB): number {
  let filled = 0;
  let total = 0;
  for (const section of allSections(kb)) {
    const c = countFields(section);
    filled += c.filled;
    total += c.total;
  }
  return total > 0 ? filled / total : 0;
}

// Returns true when every field across the document-built sections has been explicitly
// reviewed — including null-value fields. Users must approve (or reject) null fields too.
// Image Analysis is left out (D423): a background run writes it, often well after the
// rest, so it is reviewed whenever it lands and never holds the KB back.
export function computeReadyStatus(kb: TraceableBrandKB): boolean {
  for (const section of documentSections(kb)) {
    for (const field of Object.values(section)) {
      if (field.status === "needs_review") return false;
    }
  }
  return true;
}
