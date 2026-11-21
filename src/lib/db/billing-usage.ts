import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { UsageBy } from "@/lib/billing/usage-period";
import { USAGE_RUNS_PAGE_SIZE } from "@/lib/billing/usage-page-size";

// Who used what (spec 2026-11-21-usage-by-design.md, D524). Two calls per view: the grouped sums
// (org_credit_usage_by, 0073) and the names for those keys.

export type UsageRow = { key: string | null; name: string; detail: string | null; credits: number; runs: number };
export type UsageRun = { id: string; type: string; model: string | null; credits: number; createdAt: string; memberName: string | null };
export type UsageRunsPage = { runs: UsageRun[]; total: number };


const NO_KEY_NAME: Record<UsageBy, string> = {
  member: "Someone no longer in the agency",
  client: "No client",
  canvas: "Outside a canvas (avatars, scripts)",
};

async function namesFor(by: UsageBy, ids: string[]): Promise<Map<string, { name: string; detail: string | null }>> {
  const names = new Map<string, { name: string; detail: string | null }>();
  if (ids.length === 0) return names;
  const supabase = createServerSupabase();
  if (by === "member") {
    const { data, error } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
    if (error) throw error;
    for (const r of (data ?? []) as { user_id: string; display_name: string | null }[]) names.set(r.user_id, { name: r.display_name ?? "Unnamed", detail: null });
  } else if (by === "client") {
    const { data, error } = await supabase.from("clients").select("id, name").in("id", ids);
    if (error) throw error;
    for (const r of (data ?? []) as { id: string; name: string }[]) names.set(r.id, { name: r.name, detail: null });
  } else {
    const { data, error } = await supabase.from("canvases").select("id, name, client:clients(name)").in("id", ids);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as { id: string; name: string | null; client: { name: string } | null }[]) {
      names.set(r.id, { name: r.name || "Untitled canvas", detail: r.client?.name ?? null });
    }
  }
  return names;
}

/** Credits charged in the period, per member, client or canvas, most first. */
export async function getUsageBy(orgId: string, by: UsageBy, range: { from: string; to: string }): Promise<UsageRow[]> {
  const { data, error } = await createServerSupabase().rpc("org_credit_usage_by", { p_org_id: orgId, p_from: range.from, p_to: range.to, p_by: by });
  if (error) throw error;
  const rows = (data ?? []) as { key: string | null; credits: number | string; runs: number }[];
  const names = await namesFor(by, rows.map((r) => r.key).filter((k): k is string => !!k));
  return rows.map((r) => {
    const named = r.key ? names.get(r.key) : null;
    return { key: r.key, name: named?.name ?? (r.key ? "Removed" : NO_KEY_NAME[by]), detail: named?.detail ?? null, credits: Number(r.credits), runs: r.runs };
  });
}

type RunRow = { id: string; type: string; model_used: string | null; credits_charged: number | string; created_at: string; user_id: string | null };

/** One group's charged runs in the period, newest first, a page at a time. `key` null is the
 *  group with no member, client or canvas. */
export async function listUsageRuns(
  orgId: string,
  by: UsageBy,
  key: string | null,
  range: { from: string; to: string },
  page: number,
): Promise<UsageRunsPage> {
  const supabase = createServerSupabase();
  const columns = "id, type, model_used, credits_charged, created_at, user_id";
  // A canvas is reached through the run's node, so that filter needs the node joined.
  let q = supabase
    .from("generations")
    .select(by === "canvas" && key ? `${columns}, node:nodes!inner(canvas_id)` : columns, { count: "exact" })
    .eq("org_id", orgId)
    .gt("credits_charged", 0)
    .gte("created_at", range.from)
    .lt("created_at", range.to);
  if (by === "member") q = key ? q.eq("user_id", key) : q.is("user_id", null);
  else if (by === "client") q = key ? q.eq("client_id", key) : q.is("client_id", null);
  else q = key ? q.eq("node.canvas_id", key) : q.is("node_id", null);
  const from = (page - 1) * USAGE_RUNS_PAGE_SIZE;
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, from + USAGE_RUNS_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RunRow[];
  const people = await namesFor("member", [...new Set(rows.map((r) => r.user_id).filter((u): u is string => !!u))]);
  return {
    runs: rows.map((r) => ({
      id: r.id,
      type: r.type,
      model: r.model_used,
      credits: Number(r.credits_charged),
      createdAt: r.created_at,
      memberName: r.user_id ? people.get(r.user_id)?.name ?? null : null,
    })),
    total: count ?? 0,
  };
}
