import { z } from "zod";
import { FIELD_LABELS, MODULES } from "@/lib/kb/constants";
import { TraceableBrandKBSchema, type KBField, type KBFieldStatus, type TraceableBrandKB } from "@/lib/kb/schema";
import type { ModuleKey } from "@/lib/kb/types";
import { getFieldPath, getNestedValue } from "@/lib/kb/utils";

// The fields of a brand KB a person reviews before approving it, as the copilot sees them: the six
// sections the build writes. Image Analysis is left out everywhere here: it is written by its own
// run and never holds the KB back (D423). Pure.

export type ReviewField = {
  /** Dotted, as stored: "target_audience.age_range". */
  path: string;
  module: ModuleKey;
  label: string;
  /** "Audience & Casting · Age Range". */
  title: string;
  kind: "text" | "list";
  value: string | string[] | null;
  /** The build derived it; the sources did not state it. */
  inferred: boolean;
  status: KBFieldStatus;
};

/** The tabs whose fields are reviewed, with where each one's fields are stored. */
const SECTIONS: { module: ModuleKey; label: string; section: string[] }[] = MODULES
  .filter((m) => m.key !== "image_analysis")
  .map((m) => ({ module: m.key, label: m.label, section: getFieldPath(m.key, "").slice(0, -1) }));

/** The fields scripts lean on hardest, asked about first (brand KB spec §2.3). */
export const QUESTION_PRIORITY: readonly string[] = [
  "compliance.content_rules",
  "target_audience.age_range",
  "brand_profile.tone_of_voice",
  "target_audience.pain_points",
  "target_audience.desires",
  "compliance.never_use_claims",
  "compliance.never_use_words",
  "compliance.disclaimers",
  "target_audience.location",
  "brand_profile.positioning",
  "target_audience.human_casting",
  "brand_profile.personality",
];

type ObjectShape = z.ZodObject<Record<string, z.ZodTypeAny>>;

function schemaAt(path: string[]): z.ZodTypeAny | undefined {
  let node: z.ZodTypeAny | undefined = TraceableBrandKBSchema;
  for (const key of path) node = node instanceof z.ZodObject ? (node as ObjectShape).shape[key] : undefined;
  return node;
}

/** Whether a field holds text or a list, by the schema, so an empty list field is still a list.
 *  Null for anything that is not one of the reviewed fields. */
export function fieldKind(path: string): "text" | "list" | null {
  const parts = path.split(".");
  const section = parts.slice(0, -1).join(".");
  if (!SECTIONS.some((s) => s.section.join(".") === section)) return null;
  const field = schemaAt(parts);
  if (!(field instanceof z.ZodObject)) return null;
  const value = (field as ObjectShape).shape.value;
  const inner = value instanceof z.ZodNullable ? value.unwrap() : value;
  return inner instanceof z.ZodArray ? "list" : "text";
}

export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Every reviewed field as stored, tab by tab. A field the stored KB does not have is not listed:
 *  there is nothing to write an answer into. */
export function reviewFields(kb: TraceableBrandKB): ReviewField[] {
  const out: ReviewField[] = [];
  for (const { module, label: tab, section } of SECTIONS) {
    const stored = getNestedValue(kb as unknown as Record<string, unknown>, section);
    if (!stored || typeof stored !== "object") continue;
    for (const [key, raw] of Object.entries(stored as Record<string, KBField<unknown>>)) {
      const path = [...section, key].join(".");
      const kind = fieldKind(path);
      if (!kind || !raw || typeof raw !== "object") continue;
      const label = FIELD_LABELS[key] ?? key;
      out.push({
        path, module, label, title: `${tab} · ${label}`, kind,
        value: (raw.value ?? null) as string | string[] | null,
        inferred: raw.evidence_type === "inferred",
        status: raw.status,
      });
    }
  }
  return out;
}

/** What the copilot could not settle: still unreviewed, and inferred or empty. The fields scripts
 *  lean on hardest come first, then the rest as given. */
export function unsettled(fields: ReviewField[]): ReviewField[] {
  const open = fields.filter((f) => f.status === "needs_review" && (f.inferred || isEmpty(f.value)));
  const rank = (f: ReviewField) => {
    const i = QUESTION_PRIORITY.indexOf(f.path);
    return i === -1 ? QUESTION_PRIORITY.length : i;
  };
  return open.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map(({ f }) => f);
}

/** `inferred` counts filled fields only: an empty field is counted once, as empty. */
export function reviewAccount(fields: ReviewField[]): { total: number; filled: number; inferred: number; empty: number } {
  const empty = fields.filter((f) => isEmpty(f.value)).length;
  return { total: fields.length, filled: fields.length - empty, inferred: fields.filter((f) => f.inferred && !isEmpty(f.value)).length, empty };
}

/** Unreviewed paths counted per tab, in tab order; a tab with none is left out. */
export function unreviewedByModule(paths: string[]): { module: ModuleKey; label: string; count: number }[] {
  return SECTIONS
    .map(({ module, label, section }) => {
      const prefix = `${section.join(".")}.`;
      return { module, label, count: paths.filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes(".")).length };
    })
    .filter((m) => m.count > 0);
}

/** Every reviewed field's path, from the schema: what a tool may name, whatever one KB holds. */
export const REVIEW_FIELD_PATHS: string[] = SECTIONS.flatMap(({ section }) => {
  const shape = schemaAt(section);
  return shape instanceof z.ZodObject ? Object.keys((shape as ObjectShape).shape).map((key) => [...section, key].join(".")) : [];
});
