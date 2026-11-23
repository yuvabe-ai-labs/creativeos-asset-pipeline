import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { endsAtFromDay } from "@/lib/billing/dates";
import { BILLING_LOG_PAGE_SIZE } from "@/lib/billing/usage-page-size";

// Yuvabe's billing changes (migration 0067). Each RPC locks the agency, makes the change and logs
// it in one transaction. Spec 2026-11-20-admin-agency-billing-design.md.

export type { BillingMode } from "@/lib/billing/grants";
import type { BillingMode } from "@/lib/billing/grants";
export type AdminGrantKind = "free" | "admin";

/** False when the agency is missing or already in that mode. */
export async function setBillingMode(orgId: string, mode: BillingMode, actorId: string, reason: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("admin_set_billing_mode", { p_org_id: orgId, p_mode: mode, p_actor: actorId, p_reason: reason });
  if (error) throw error;
  return data === true;
}

/** The new grant's id, or null when the agency is missing. The credits work through `day`. */
export async function grantCredits(
  orgId: string,
  kind: AdminGrantKind,
  credits: number,
  day: string,
  actorId: string,
  reason: string,
): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("admin_grant_credits", {
    p_org_id: orgId,
    p_kind: kind,
    p_credits: credits,
    p_ends_at: endsAtFromDay(day),
    p_actor: actorId,
    p_reason: reason,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function takeBackCredits(grantId: string, credits: number, actorId: string, reason: string): Promise<"ok" | "not_found" | "too_many"> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("admin_take_back_credits", { p_grant_id: grantId, p_credits: credits, p_actor: actorId, p_reason: reason });
  if (error) throw error;
  return data as "ok" | "not_found" | "too_many";
}

/** Move the end to the end of `day`, or end now when `day` is null. */
export async function setGrantEnd(grantId: string, day: string | null, actorId: string, reason: string): Promise<"ok" | "not_found"> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("admin_set_grant_end", {
    p_grant_id: grantId,
    p_ends_at: day ? endsAtFromDay(day) : new Date().toISOString(),
    p_actor: actorId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as "ok" | "not_found";
}

export type BillingLogEntry = {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
  actorName: string | null;
};

type LogRow = { id: string; action: string; before: BillingLogEntry["before"]; after: BillingLogEntry["after"]; reason: string | null; created_at: string; actor_id: string | null };

export type BillingLogPage = { entries: BillingLogEntry[]; total: number };

// One page, newest first, with the total from the same request (D529). Names come from profiles
// in a second query (billing_log points at auth.users, so the two can't be joined in one request).
export async function listBillingLog(orgId: string, page = 1): Promise<BillingLogPage> {
  const supabase = createServerSupabase();
  const from = (page - 1) * BILLING_LOG_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("billing_log")
    .select("id, action, before, after, reason, created_at, actor_id", { count: "exact" })
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .range(from, from + BILLING_LOG_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as LogRow[];
  const ids = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people, error: namesError } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
    if (namesError) throw namesError;
    for (const p of (people ?? []) as { user_id: string; display_name: string | null }[]) {
      if (p.display_name) names.set(p.user_id, p.display_name);
    }
  }
  const entries = rows.map((r) => ({
    id: r.id,
    action: r.action,
    before: r.before,
    after: r.after,
    reason: r.reason,
    createdAt: r.created_at,
    actorName: r.actor_id ? names.get(r.actor_id) ?? null : null,
  }));
  return { entries, total: count ?? entries.length };
}
