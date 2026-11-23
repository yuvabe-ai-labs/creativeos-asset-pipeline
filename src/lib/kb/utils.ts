import { emptyKBField, type TraceableBrandKB, type KBField } from "./schema";
import type { ModuleKey, FieldPath, StagedChanges } from "./types";
import { MODULES, MODULE_LEADING_FIELDS } from "./constants";

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
  return withLeadingFields(withAddedFields(moduleFieldsAsStored(kb, module), module), MODULE_LEADING_FIELDS[module]);
}

/** Fields that are always prose, so an empty one is still edited as text, not as a comma-split list. */
const TEXT_FIELD_KEYS: ReadonlySet<string> = new Set(["content_rules"]);

/** Whether a field is edited as a comma-separated list: a list value, or an empty value of any
 *  field that is not always prose. */
export function isListField(fieldKey: string, value: unknown): boolean {
  return Array.isArray(value) || (value === null && !TEXT_FIELD_KEYS.has(fieldKey));
}

/** Fields added to the schema after many KBs were saved: shown empty so they can be filled, without
 *  writing anything to the stored KB (readiness is computed from what is stored, fill-rate.ts). */
const ADDED_FIELDS: Partial<Record<ModuleKey, readonly string[]>> = { compliance: ["content_rules"] };

function withAddedFields(fields: Record<string, KBField<unknown>>, module: ModuleKey): Record<string, KBField<unknown>> {
  const added = ADDED_FIELDS[module]?.filter((key) => !(key in (fields ?? {})));
  if (!added?.length) return fields;
  return { ...fields, ...Object.fromEntries(added.map((key) => [key, emptyKBField<unknown>(null)])) };
}

/** The module's fields with `leading` first (in that order), the rest as they were. A stored KB
 *  keeps whatever key order it was extracted with, so display order is set here, not by the schema. */
function withLeadingFields(
  fields: Record<string, KBField<unknown>>,
  leading: readonly string[] | undefined,
): Record<string, KBField<unknown>> {
  if (!fields || !leading) return fields;
  const ordered: Record<string, KBField<unknown>> = {};
  for (const key of leading) if (key in fields) ordered[key] = fields[key];
  for (const [key, value] of Object.entries(fields)) if (!(key in ordered)) ordered[key] = value;
  return ordered;
}

const HEX_IN_TEXT = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i;

/**
 * One colour entry ("turmeric gold #c8a000", "#FFF", "navy") as its name and a normalised
 * #RRGGBB hex — uppercase, 3-digit codes expanded. `hex` is null when the entry has none.
 */
export function parseColour(entry: string): { name: string; hex: string | null } {
  const match = entry.match(HEX_IN_TEXT);
  if (!match) return { name: entry.trim(), hex: null };
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  const name = entry.replace(match[0], "").replace(/\s{2,}/g, " ").replace(/[\s,:–-]+$/, "").trim();
  return { name, hex: `#${digits.toUpperCase()}` };
}

function moduleFieldsAsStored(
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

/** Where a review field lives on the review page (D520): its tab and its key, from its dotted path.
 *  Null for a path no tab shows (Image Analysis is reviewed on its own tab, not by the copilot). */
export function fieldLocation(path: string): { module: ModuleKey; fieldKey: string } | null {
  const parts = path.split(".");
  const fieldKey = parts[parts.length - 1];
  for (const m of MODULES) {
    if (m.key === "image_analysis") continue;
    if (getFieldPath(m.key, fieldKey).join(".") === path) return { module: m.key, fieldKey };
  }
  return null;
}

// ── Review-card layout ────────────────────────────────────────────────────────

/** A field placed on the review step's 6-column card grid. */
export type FieldCardSlot = {
  fieldKey: string;
  field: KBField<unknown>;
  /** Grid columns out of 6. */
  span: 2 | 3 | 6;
};

function fieldTextLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Array.isArray(value) ? value.join(", ").length : String(value).length;
}

/**
 * Lays a module's fields out on a 6-column grid so a short value never sits beside a tall one:
 * colour fields share the first row (thirds / halves), long values (over 150 characters) take a
 * full row, and the rest pair up in halves with a field of similar length (falling back to any
 * field that isn't long). A field left without a partner takes the full row.
 */
export function layoutFieldCards(
  fields: Record<string, KBField<unknown>>,
  isColourField: (fieldKey: string) => boolean,
): FieldCardSlot[] {
  const entries = Object.entries(fields);
  const colours = entries.filter(([key]) => isColourField(key));
  const rest = entries
    .filter(([key]) => !isColourField(key))
    .map(([fieldKey, field]) => {
      const len = fieldTextLength(field.value);
      return { fieldKey, field, size: len > 150 ? "L" : len > 40 ? "M" : "S" };
    });

  const colourSpan: 2 | 3 | 6 = colours.length >= 3 ? 2 : colours.length === 2 ? 3 : 6;
  const out: FieldCardSlot[] = colours.map(([fieldKey, field]) => ({ fieldKey, field, span: colourSpan }));

  const used = new Set<number>();
  const partner = (i: number, sameSize: boolean) => {
    for (let k = i + 1; k < rest.length; k++) {
      if (used.has(k) || rest[k].size === "L") continue;
      if (!sameSize || rest[k].size === rest[i].size) return k;
    }
    return -1;
  };

  rest.forEach((item, i) => {
    if (used.has(i)) return;
    used.add(i);
    const self = { fieldKey: item.fieldKey, field: item.field };
    if (item.size === "L") { out.push({ ...self, span: 6 }); return; }
    let j = partner(i, true);
    if (j < 0) j = partner(i, false);
    if (j < 0) { out.push({ ...self, span: 6 }); return; }
    used.add(j);
    out.push({ ...self, span: 3 }, { fieldKey: rest[j].fieldKey, field: rest[j].field, span: 3 });
  });

  return out;
}

// Finds the next module (in MODULES order, wrapping around past the end) that isn't fully
// reviewed yet — used to auto-advance the review step off a module the operator just cleared
// with "Approve all". readyByModule reflects each module's current
// getModuleStatus(getModuleFields(kb, key)) === "ready" state; the caller computes it (see
// handleApproveAll in kb-onboarding-review-step.tsx) since that already depends on the live kb
// state and getModuleStatus, which this pure function has no reason to import.
export function findNextModuleNeedingReview(
  currentModule: ModuleKey,
  readyByModule: Record<ModuleKey, boolean>,
): ModuleKey | null {
  const order = MODULES.map((m) => m.key);
  const startIdx = order.indexOf(currentModule);
  for (let i = 1; i <= order.length; i++) {
    const candidate = order[(startIdx + i) % order.length];
    if (!readyByModule[candidate]) return candidate;
  }
  return null;
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
