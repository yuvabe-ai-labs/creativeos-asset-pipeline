import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { RegionBounds } from "@/lib/review-annotations/payload";

export type AnnotationRow = {
  id: string;
  decision_id: string;
  org_id: string;
  seq: number;
  kind: "image" | "video-frame";
  timecode_ms: number | null;
  frame_path: string | null;
  mask_path: string;
  note: string;
  // D218: painted bbox in natural-size fractions. Null for pre-D218 rows.
  bounds: RegionBounds | null;
  created_at: string;
};

// STRICT, unlike insertDecision's best-effort posture: annotations ARE the feedback,
// not observability, so the caller (setVersionApprovalAction) lets this throw (D214).
export async function insertAnnotations(
  rows: Omit<AnnotationRow, "id" | "created_at">[],
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.from("node_version_annotations").insert(rows);
  if (error) throw error;
}

// Batched over every decision on a node in one query — the sibling of
// getDecisionsByVersionIds, grouped the same way.
export async function getAnnotationsByDecisionIds(
  decisionIds: string[],
): Promise<Map<string, AnnotationRow[]>> {
  if (decisionIds.length === 0) return new Map();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("node_version_annotations")
    .select(
      "id, decision_id, org_id, seq, kind, timecode_ms, frame_path, mask_path, note, bounds, created_at",
    )
    .in("decision_id", decisionIds)
    .order("decision_id", { ascending: true })
    .order("seq", { ascending: true });
  if (error) throw error;
  const byDecision = new Map<string, AnnotationRow[]>();
  for (const r of (data ?? []) as AnnotationRow[]) {
    const list = byDecision.get(r.decision_id) ?? [];
    list.push(r);
    byDecision.set(r.decision_id, list);
  }
  return byDecision;
}
