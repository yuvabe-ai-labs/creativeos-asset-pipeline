// Puts a newer Image Analysis over the one the team has been reviewing (D318). Pure. Used wherever
// two versions of the section meet: a run writing its result, a Save from the review screen, and
// the review screen taking a finished run's result into its draft.
import type { KBField, TraceableBrandKB } from "@/lib/kb/schema";
import { sameValue as sameSaid } from "@/lib/kb/changes/card";
import { TALLIED_FIELDS } from "./constants";

type ImageAnalysis = TraceableBrandKB["image_analysis"];

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Field by field, `reviewed` is what the team has seen and `next` is newer:
 * - edited: the team's own words win, always;
 * - approved or rejected: the decision stays while the value is the same; a counted field (format
 *   mix, purpose mix, colours) keeps it even as its numbers move, since it is the same measure;
 * - otherwise, or once a written field says something new, the newer field, to review.
 */
export function mergeImageAnalysis(reviewed: ImageAnalysis | null | undefined, next: ImageAnalysis): ImageAnalysis {
  if (!reviewed) return next;
  const merged = { ...next };
  for (const key of Object.keys(next) as (keyof ImageAnalysis)[]) {
    const before = reviewed[key] as KBField<unknown> | undefined;
    const after = next[key] as KBField<unknown>;
    if (!before || before.value === null) continue;
    if (before.status === "edited") {
      (merged[key] as KBField<unknown>) = before;
    } else if (
      (before.status === "approved" || before.status === "rejected") &&
      (TALLIED_FIELDS.has(key) || sameValue(before.value, after.value))
    ) {
      (merged[key] as KBField<unknown>) = { ...after, status: before.status };
    }
  }
  return merged;
}

/**
 * What a finished study may write, and what it must propose instead (piece 2b). Pure. As
 * `mergeImageAnalysis`, except that a written field the team approved or rejected is never replaced:
 * when the study reads it differently the field stays as it is, and the new reading is a proposal
 * for a change card. Counted fields never go on a card: they are the same measure with new numbers.
 */
export function studyImageAnalysis(
  reviewed: ImageAnalysis | null | undefined, next: ImageAnalysis,
): { section: ImageAnalysis; proposals: { key: keyof ImageAnalysis; value: unknown }[] } {
  if (!reviewed) return { section: next, proposals: [] };
  const section = { ...next };
  const proposals: { key: keyof ImageAnalysis; value: unknown }[] = [];
  for (const key of Object.keys(next) as (keyof ImageAnalysis)[]) {
    const before = reviewed[key] as KBField<unknown> | undefined;
    const after = next[key] as KBField<unknown>;
    if (!before || before.value === null) continue;
    if (before.status === "edited") {
      (section[key] as KBField<unknown>) = before;
    } else if (before.status === "approved" || before.status === "rejected") {
      if (TALLIED_FIELDS.has(key) || sameSaid(before.value, after.value)) {
        (section[key] as KBField<unknown>) = { ...after, status: before.status };
      } else {
        (section[key] as KBField<unknown>) = before;
        proposals.push({ key, value: after.value });
      }
    }
  }
  return { section, proposals };
}
