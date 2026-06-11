import type { TraceableBrandKB, KBField } from "./schema";
import type { ModuleKey, FieldPath, StagedChanges } from "./types";

// ── Nested object helpers ─────────────────────────────────────────────────────

// Reads a value at a nested path. Returns undefined if any segment is missing.
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string[],
): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

// Traverses an object by path (array of keys) and merges `patch` into the
// leaf node. Returns a new object (does not mutate the input).
export function setNestedField(
  obj: Record<string, unknown>,
  path: string[],
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  if (rest.length === 0) {
    return {
      ...obj,
      [head]: { ...(obj[head] as object), ...patch },
    };
  }
  return {
    ...obj,
    [head]: setNestedField(
      (obj[head] ?? {}) as Record<string, unknown>,
      rest,
      patch,
    ),
  };
}

// ── KB module helpers ─────────────────────────────────────────────────────────

export function getModuleFields(
  kb: TraceableBrandKB,
  module: ModuleKey,
): Record<string, KBField<unknown>> {
  switch (module) {
    case "brand_voice":      return kb.brand_profile as unknown as Record<string, KBField<unknown>>;
    case "visual_identity":  return kb.visual_identity as unknown as Record<string, KBField<unknown>>;
    case "image_analysis":   return kb.image_analysis as unknown as Record<string, KBField<unknown>>;
    case "audience_casting": return kb.target_audience as unknown as Record<string, KBField<unknown>>;
    case "image_direction":  return kb.creative_direction.image as unknown as Record<string, KBField<unknown>>;
    case "video_direction":  return kb.creative_direction.video as unknown as Record<string, KBField<unknown>>;
    case "compliance":       return kb.compliance as unknown as Record<string, KBField<unknown>>;
  }
}

export function getFieldPath(module: ModuleKey, fieldKey: string): FieldPath {
  switch (module) {
    case "brand_voice":      return ["brand_profile", fieldKey];
    case "visual_identity":  return ["visual_identity", fieldKey];
    case "image_analysis":   return ["image_analysis", fieldKey];
    case "audience_casting": return ["target_audience", fieldKey];
    case "image_direction":  return ["creative_direction", "image", fieldKey];
    case "video_direction":  return ["creative_direction", "video", fieldKey];
    case "compliance":       return ["compliance", fieldKey];
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Pinned locale + explicit format so SSR (Node) and the browser produce the
// SAME string — otherwise the host-default locale differs and React throws a
// hydration mismatch. "en-GB" with a short month is unambiguous: "5 Jun 2026".
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(value: string | number | Date): string {
  return DATE_FORMAT.format(new Date(value));
}

export function buildChangeSummary(staged: StagedChanges): string {
  const { pendingDocRemovals, pendingImageRemovals, newlyAddedDocIds, newlyAddedImageIds } = staged;
  const parts: string[] = [];
  if (pendingDocRemovals.size > 0)
    parts.push(`${pendingDocRemovals.size} document${pendingDocRemovals.size !== 1 ? "s" : ""} removed`);
  if (pendingImageRemovals.size > 0)
    parts.push(`${pendingImageRemovals.size} image${pendingImageRemovals.size !== 1 ? "s" : ""} removed`);
  if (newlyAddedDocIds.size > 0)
    parts.push(`${newlyAddedDocIds.size} document${newlyAddedDocIds.size !== 1 ? "s" : ""} added`);
  if (newlyAddedImageIds.size > 0)
    parts.push(`${newlyAddedImageIds.size} image${newlyAddedImageIds.size !== 1 ? "s" : ""} added`);
  return parts.join(", ");
}
