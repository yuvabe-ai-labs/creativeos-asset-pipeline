import { FIELD_LABELS, MODULE_LEADING_FIELDS } from "@/lib/kb/constants";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { sameValue } from "@/lib/kb/changes/card";

// A re-study writes the fields it may write itself (piece 2b: a reviewed field goes on a change card
// instead), and the copilot says in the thread which fields it changed directly. Pure.

type Section = TraceableBrandKB["image_analysis"];

/** The labels of the fields whose value differs between two versions of the section, in the order
 *  the screen shows them. */
export function changedImageFields(before: Section, after: Section): string[] {
  const b = before as unknown as Record<string, { value: unknown } | undefined>;
  const a = after as unknown as Record<string, { value: unknown } | undefined>;
  const leading = MODULE_LEADING_FIELDS.image_analysis ?? [];
  const keys = [...leading, ...Object.keys(a).filter((k) => !leading.includes(k))];
  return keys
    .filter((key) => a[key] && !sameValue(b[key]?.value, a[key]?.value))
    .map((key) => FIELD_LABELS[key] ?? key);
}

/** The line for the thread, or null when nothing changed. */
export function imageAnalysisNote(labels: string[]): string | null {
  return labels.length > 0 ? `Studied the images again. Changed: ${labels.join(", ")}.` : null;
}
