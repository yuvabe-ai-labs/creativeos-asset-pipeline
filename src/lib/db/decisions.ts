import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type DecisionRow = {
  id: string;
  version_id: string;
  org_id: string;
  status: "approved" | "changes_requested";
  note: string | null;
  decided_by_user_id: string | null;
  decided_at: string;
};

// D173/D175: append-only, and deliberately best-effort from the CALLER's perspective —
// setVersionApprovalAction catches and logs any error this throws rather than letting a
// logging failure block or fail the approve/reject action itself.
export async function insertDecision(input: {
  versionId: string;
  orgId: string;
  status: "approved" | "changes_requested";
  note: string | null;
  decidedByUserId: string;
  decidedAt: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("node_version_decisions").insert({
    version_id: input.versionId,
    org_id: input.orgId,
    status: input.status,
    note: input.note,
    decided_by_user_id: input.decidedByUserId,
    decided_at: input.decidedAt,
  });
  if (error) throw error;
}

// D173: batched over every version on a node in ONE query — same shape as
// getCreditsChargedByVersionIds (src/lib/db/generations.ts), grouped client-side into an
// array per version since, unlike credits, more than one decision can exist per version.
export async function getDecisionsByVersionIds(
  versionIds: string[],
): Promise<Map<string, DecisionRow[]>> {
  if (versionIds.length === 0) return new Map();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("node_version_decisions")
    .select("id, version_id, org_id, status, note, decided_by_user_id, decided_at")
    .in("version_id", versionIds)
    .order("decided_at", { ascending: false });
  if (error) throw error;
  const byVersion = new Map<string, DecisionRow[]>();
  for (const row of (data ?? []) as DecisionRow[]) {
    const list = byVersion.get(row.version_id) ?? [];
    list.push(row);
    byVersion.set(row.version_id, list);
  }
  return byVersion;
}
