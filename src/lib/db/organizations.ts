import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  monthly_credit_limit: number | null;
  created_at: string;
};

export type OrgWithCount = OrgRow & { client_count: number; owner_pending: boolean };

// The agencies list. owner_pending: the agency has no owner yet (its invited owner hasn't signed
// up, spec §6.6). Owners are read in one query beside the agencies.
export async function listOrgsWithClientCount(): Promise<OrgWithCount[]> {
  const supabase = createServerSupabase();
  const [orgsRes, ownersRes] = await Promise.all([
    supabase.from("organizations").select("*, clients(count)").order("created_at", { ascending: true }),
    supabase.from("org_memberships").select("org_id").eq("is_owner", true),
  ]);
  if (orgsRes.error) throw orgsRes.error;
  if (ownersRes.error) throw ownersRes.error;
  const owned = new Set(((ownersRes.data ?? []) as { org_id: string }[]).map((r) => r.org_id));
  return ((orgsRes.data ?? []) as (OrgRow & { clients: { count: number }[] })[]).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    monthly_credit_limit: o.monthly_credit_limit,
    created_at: o.created_at,
    client_count: o.clients?.[0]?.count ?? 0,
    owner_pending: !owned.has(o.id),
  }));
}

export async function getOrgById(id: string): Promise<OrgRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as OrgRow) ?? null;
}

// "Used this month" for the header's live credits display (and, later, any other
// org-scoped usage UI) — reads the same org_credit_usage view (migration 0019) the admin
// Overview tile will use. 0 (not null) when the org has no transactions yet this month —
// the view simply has no row to return in that case.
export async function getOrgCreditUsage(orgId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("org_credit_usage")
    .select("credits_used")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as { credits_used: number } | null)?.credits_used ?? 0;
}

// One point on the Generations tab's trend chart, at whatever granularity fetched it —
// `period` is an ISO timestamp at the start of that day/month/year (UTC). Shared shape
// across all three granularities so the chart component doesn't need to know which one
// produced the data it's rendering.
export type CreditHistoryPoint = { period: string; creditsUsed: number };

// Last N days' totals (default 30), oldest first.
export async function getOrgDailyCreditHistory(
  orgId: string,
  days = 30,
): Promise<CreditHistoryPoint[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_daily_credit_history", {
    p_org_id: orgId,
    p_days: days,
  });
  if (error) throw error;
  return ((data ?? []) as { day: string; credits_used: number }[]).map((row) => ({
    period: row.day,
    creditsUsed: row.credits_used,
  }));
}

// Last N months' totals (default 6), oldest first.
export async function getOrgMonthlyCreditHistory(
  orgId: string,
  months = 6,
): Promise<CreditHistoryPoint[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_monthly_credit_history", {
    p_org_id: orgId,
    p_months: months,
  });
  if (error) throw error;
  return ((data ?? []) as { month: string; credits_used: number }[]).map((row) => ({
    period: row.month,
    creditsUsed: row.credits_used,
  }));
}

// Last N years' totals (default 5), oldest first.
export async function getOrgYearlyCreditHistory(
  orgId: string,
  years = 5,
): Promise<CreditHistoryPoint[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_yearly_credit_history", {
    p_org_id: orgId,
    p_years: years,
  });
  if (error) throw error;
  return ((data ?? []) as { year: string; credits_used: number }[]).map((row) => ({
    period: row.year,
    creditsUsed: row.credits_used,
  }));
}

export type CreditBreakdownRow = { key: string; credits: number };

// Credits used by generation type (image/video/prompt) for one month window.
export async function getOrgCreditBreakdownByType(
  orgId: string,
  monthStart: string,
  monthEnd: string,
): Promise<CreditBreakdownRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_credit_breakdown_by_type", {
    p_org_id: orgId,
    p_month_start: monthStart,
    p_month_end: monthEnd,
  });
  if (error) throw error;
  return ((data ?? []) as { type: string; credits: number }[]).map((row) => ({
    key: row.type,
    credits: row.credits,
  }));
}

// Credits used by model for one month window. model_used can be null on an old/pre-model
// row — labeled "Unknown" rather than dropped, so the breakdown's total still reconciles
// with the month's real total.
export async function getOrgCreditBreakdownByModel(
  orgId: string,
  monthStart: string,
  monthEnd: string,
): Promise<CreditBreakdownRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("org_credit_breakdown_by_model", {
    p_org_id: orgId,
    p_month_start: monthStart,
    p_month_end: monthEnd,
  });
  if (error) throw error;
  return ((data ?? []) as { model: string | null; credits: number }[]).map((row) => ({
    key: row.model ?? "Unknown",
    credits: row.credits,
  }));
}

// Safely sets/clears the forced-password-change flag on an EXISTING user's app_metadata.
// Never pass a bare `{ must_change_password: value }` object literal to
// auth.admin.updateUserById — it would silently wipe any other app_metadata that user
// already has (e.g. platform_role), the same trap docs/auth-bootstrap.md's own bootstrap
// step avoids by merging via Postgres's `||` operator instead of the admin API directly.
export async function setMustChangePassword(userId: string, value: boolean): Promise<void> {
  const supabase = createServerSupabase();
  const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(userId);
  if (getErr) throw getErr;
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...existing.user.app_metadata, must_change_password: value },
  });
  if (error) throw error;
}

// Verifies the member actually belongs to this org before touching auth state — defense
// in depth against a tampered orgId/userId pair from the client, even though super_admin
// already has broad admin access. Sets must_change_password so the member is forced to
// pick their own password on next login, same as a freshly onboarded owner.
export async function resetMemberPassword(
  orgId: string,
  userId: string,
  newPassword: string,
): Promise<void> {
  const supabase = createServerSupabase();

  const { data: membership, error: memErr } = await supabase
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memErr) throw memErr;
  if (!membership) throw new Error("Member not found in this agency.");

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) throw error;

  await setMustChangePassword(userId, true);
}

export async function updateOrgCreditLimit(
  orgId: string,
  limit: number | null,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("organizations")
    .update({ monthly_credit_limit: limit })
    .eq("id", orgId);
  if (error) throw error;
}

export function generateTempPassword(): string {
  // 12 chars, guaranteed a letter + a number — a reasonable default even with no
  // forced-change flow to enforce strength at first login (D84).
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return "Cr" + out + "7";
}
