import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GenerationRow } from "./types";
import { getReservationAmounts } from "./credit-transactions";
import type { GenerationRow as ImpersonationGenerationRow } from "@/lib/auth/impersonation-audit-view";

// Real settled credits per version, keyed by version_id — for the node focus views' usage
// popovers, which used to recompute an estimate client-side from paramsUsed.tokensUsed. That
// recompute could drift from what was actually charged (the credit ledger is the source of
// truth); this reads the real settlement instead. null/absent for legacy versions that predate
// the credit system (no matching succeeded generation) — callers show "—" for those, not 0.
export async function getCreditsChargedByVersionIds(
  versionIds: string[],
): Promise<Map<string, number>> {
  if (versionIds.length === 0) return new Map();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("version_id, credits_charged")
    .in("version_id", versionIds)
    .not("credits_charged", "is", null);
  if (error) throw error;
  return new Map(
    (data as { version_id: string | null; credits_charged: number | null }[])
      .filter(
        (r): r is { version_id: string; credits_charged: number } =>
          r.version_id !== null && r.credits_charged !== null,
      )
      .map((r) => [r.version_id, r.credits_charged]),
  );
}

export async function insertGeneration(input: {
  nodeId: string;
  orgId: string;
  clientId?: string;
  userId?: string;
  userEmail?: string | null;
  type: GenerationRow["type"];
  modelUsed?: string;
  paramsSnapshot?: Record<string, unknown>;
  inputsSnapshot?: Record<string, unknown>;
}): Promise<GenerationRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .insert({
      node_id: input.nodeId,
      org_id: input.orgId,
      client_id: input.clientId ?? null,
      user_id: input.userId ?? null,
      // Lightweight snapshot for support/debugging — who kicked this off, captured once
      // at creation. Not overwritten later: succeedGeneration only touches `meta` when
      // explicitly given a value, so this survives completion.
      meta: input.userEmail ? { email: input.userEmail } : null,
      type: input.type,
      status: "running",
      model_used: input.modelUsed ?? null,
      params_snapshot: input.paramsSnapshot ?? {},
      inputs_snapshot: input.inputsSnapshot ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as GenerationRow;
}

export async function succeedGeneration(input: {
  generationId: string;
  versionId: string;
  costUsd?: number;
  creditsCharged?: number;
  tokensUsed?: Record<string, unknown> | null;
  outputSnapshot?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServerSupabase();
  const update: Record<string, unknown> = {
    status: "succeeded",
    version_id: input.versionId,
    cost_usd: input.costUsd ?? null,
    credits_charged: input.creditsCharged ?? null,
    updated_at: new Date().toISOString(),
  };
  // Real settlement-time token usage — the actual figure charged against, not the
  // pre-generation estimate. Previously this was written only onto node_versions.params_used
  // (a join away); mirroring it here too means the admin generations list can read it
  // straight off generations without a join.
  if (input.tokensUsed !== undefined) update.tokens_used = input.tokensUsed;
  if (input.outputSnapshot !== undefined) update.output_snapshot = input.outputSnapshot;
  // Only touch meta when explicitly given a new value — insertGeneration already set it
  // (e.g. the creator's email) and an unconditional overwrite here would silently wipe
  // that out on every completion, since most callers never pass meta.
  if (input.meta !== undefined) update.meta = input.meta;

  const { error } = await supabase
    .from("generations")
    .update(update)
    .eq("id", input.generationId);
  if (error) throw error;
}

export async function failGeneration(input: {
  generationId: string;
  error: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("generations")
    .update({
      status: "failed",
      error: input.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.generationId);
  if (error) throw error;
}

export async function getGeneration(id: string): Promise<GenerationRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as GenerationRow;
}

export async function listGenerations(nodeId: string): Promise<GenerationRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GenerationRow[];
}

export async function countGenerationsForOrg(orgId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { count, error } = await supabase
    .from("generations")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return count ?? 0;
}

export type GenerationForOrgList = GenerationRow & {
  // The pre-generation reservation amount, read back from credit_transactions — the source
  // of truth, never duplicated onto the generations row itself. null when no reservation
  // was ever made for this generation.
  estimated_credits: number | null;
};

export type GenerationsPage = { rows: GenerationForOrgList[]; total: number };

const GENERATIONS_PAGE_SIZES = [10, 20, 30, 40, 50] as const;
export type GenerationsPageSize = (typeof GENERATIONS_PAGE_SIZES)[number];

export function isGenerationsPageSize(v: number): v is GenerationsPageSize {
  return (GENERATIONS_PAGE_SIZES as readonly number[]).includes(v);
}

// On-demand server-side pagination — the admin generations list previously fetched a flat
// `.limit(100)` and paginated client-side; this instead fetches exactly one page at a time
// via `.range()`, with an exact count for the pager. `query` filters on
// model_used (case-insensitive substring); `sort` matches src/lib/list/filter-sort.ts's
// SortKey so the same toolbar semantics apply, just executed by Postgres instead of JS.
export async function listGenerationsForOrgPage(
  orgId: string,
  options: {
    page: number;
    pageSize: GenerationsPageSize;
    query?: string;
    sort?: "recent" | "name";
  },
): Promise<GenerationsPage> {
  const supabase = createServerSupabase();
  const { page, pageSize, query, sort = "recent" } = options;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("generations")
    .select("*", { count: "exact" })
    .eq("org_id", orgId);
  if (query?.trim()) q = q.ilike("model_used", `%${query.trim()}%`);
  q =
    sort === "name"
      ? q.order("model_used", { ascending: true })
      : q.order("created_at", { ascending: false });

  const { data, count, error } = await q.range(from, to);
  if (error) throw error;

  const rows = (data ?? []) as GenerationRow[];
  const reservations = await getReservationAmounts(rows.map((r) => r.id));

  return {
    rows: rows.map((g) => ({
      ...g,
      estimated_credits: reservations.get(g.id) ?? null,
    })),
    total: count ?? 0,
  };
}

// Generations for an org since a point in time — the read side of the impersonation
// audit view (D141). generations.user_id is the REAL operator even while impersonating,
// which is what makes correlating them to an impersonation session possible at all.
//
// Deviation from the plan brief: generations carries org_id directly (added by the RLS
// backstop, migration 0014) — the same column listGenerationsForOrgPage above filters on
// — so this scopes the same way rather than joining through nodes/canvases/clients; no
// such join exists anywhere in this file. The brief's `credits_consumed` column also no
// longer exists — migration 0019 renamed it to `cost_usd` and added a separate
// `credits_charged` column for the real settled amount — so it's selected as
// `credits_charged` and aliased back to `credits_consumed` to match GenerationRow's shape.
export async function listGenerationsInWindowForOrg(
  orgId: string,
  fromISO: string,
): Promise<ImpersonationGenerationRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select(
      "node_id, type, model_used, status, credits_consumed:credits_charged, user_id, created_at",
    )
    .eq("org_id", orgId)
    .gte("created_at", fromISO)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ImpersonationGenerationRow[];
}
