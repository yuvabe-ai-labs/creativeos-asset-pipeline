import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { catalogModelLabel } from "@/lib/ai-models/model-lists";
import { previousRange, usageRange, type UsageBy, type UsagePeriod } from "@/lib/billing/usage-period";
import { USAGE_RUNS_PAGE_SIZE } from "@/lib/billing/usage-page-size";
import { buildUsageOverview, type OverviewDbRow, type UsageOverview } from "@/lib/billing/usage-overview";
import { typesOf, type UsageKind } from "@/lib/billing/usage-kinds";

// The owner's Usage page (D597): one read for everything about a period (org_usage_overview,
// 0106) and one for a group's runs a page at a time (org_usage_runs). Both read the credit ledger's
// charges, so the runs listed add up to the totals shown. Model names come from the catalog, which
// is kept in memory (no query of its own most of the time).

export type UsageRun = {
  id: string;
  type: string;
  /** The model's name, never its id. */
  model: string | null;
  credits: number;
  createdAt: string;
  memberName: string | null;
  clientName: string | null;
  canvasName: string | null;
};
export type UsageRunsPage = { runs: UsageRun[]; total: number };

/** Everything the Usage page shows about credits used in the period. */
export async function getUsageOverview(orgId: string, period: UsagePeriod, now: Date = new Date()): Promise<UsageOverview> {
  const range = usageRange(period, now);
  const before = previousRange(period, now);
  const [res, catalog] = await Promise.all([
    createServerSupabase().rpc("org_usage_overview", { p_org_id: orgId, p_from: range.from, p_to: range.to, p_prev_from: before.from }),
    getAiCatalog(),
  ]);
  if (res.error) throw res.error;
  return buildUsageOverview((res.data ?? []) as OverviewDbRow[], {
    period,
    ...range,
    now,
    modelLabel: (id) => catalogModelLabel(catalog, id),
  });
}

type RunRow = {
  id: string;
  type: string;
  model: string | null;
  credits: number | string;
  created_at: string;
  member_name: string | null;
  client_name: string | null;
  canvas_name: string | null;
  total: number;
};

/** One group's charged runs in the period, newest first, a page at a time. `key` null is the group
 *  with no member, client, canvas or model; for `kind` it is the kind. */
export async function listUsageRuns(orgId: string, by: UsageBy, key: string | null, period: UsagePeriod, page: number): Promise<UsageRunsPage> {
  const range = usageRange(period);
  const [{ data, error }, catalog] = await Promise.all([createServerSupabase().rpc("org_usage_runs", {
    p_org_id: orgId,
    p_from: range.from,
    p_to: range.to,
    p_by: by,
    p_key: by === "kind" ? null : key,
    p_types: by === "kind" && key ? typesOf(key as UsageKind) : [],
    p_offset: (page - 1) * USAGE_RUNS_PAGE_SIZE,
    p_limit: USAGE_RUNS_PAGE_SIZE,
  }), getAiCatalog()]);
  if (error) throw error;
  const rows = (data ?? []) as RunRow[];
  return {
    runs: rows.map((r) => ({
      id: r.id,
      type: r.type,
      model: r.model ? catalogModelLabel(catalog, r.model) ?? "Older model" : null,
      credits: Number(r.credits),
      createdAt: r.created_at,
      memberName: r.member_name,
      clientName: r.client_name,
      canvasName: r.canvas_name,
    })),
    total: rows[0]?.total ?? 0,
  };
}
