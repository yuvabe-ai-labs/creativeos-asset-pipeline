import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/slug";
import type { OrgRole } from "@/lib/dal-logic";

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  monthly_credit_limit: number | null;
  created_at: string;
};

export type OrgWithCount = OrgRow & { client_count: number };

export async function listOrgsWithClientCount(): Promise<OrgWithCount[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("organizations")
    .select("*, clients(count)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as (OrgRow & { clients: { count: number }[] })[]).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    monthly_credit_limit: o.monthly_credit_limit,
    created_at: o.created_at,
    client_count: o.clients?.[0]?.count ?? 0,
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

// org_memberships and profiles both reference auth.users, but neither has a direct FK
// to the other — PostgREST can't auto-embed across that, so this is two queries + a
// JS join, not `profiles(display_name)`. Same pattern as resolveCallerContext (dal.ts).
// Email lives only in auth.users (profiles has no email column), so it's fetched per
// user via the admin API rather than a third table query — fine at this scale (an org's
// member count is small; multi-seat is still pilot-stage per D80's one-org-per-user index).
export async function listOrgMembers(
  orgId: string,
): Promise<{ user_id: string; display_name: string; org_role: string; email: string }[]> {
  const supabase = createServerSupabase();
  const { data: memberships, error: memErr } = await supabase
    .from("org_memberships")
    .select("user_id, org_role")
    .eq("org_id", orgId);
  if (memErr) throw memErr;
  const rows = (memberships ?? []) as { user_id: string; org_role: string }[];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);
  if (profErr) throw profErr;
  const nameByUserId = new Map(
    ((profiles ?? []) as { user_id: string; display_name: string }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );

  const users = await Promise.all(
    userIds.map((id) => supabase.auth.admin.getUserById(id)),
  );
  const emailByUserId = new Map(
    users.map(({ data, error }, i) => {
      if (error) throw error;
      return [userIds[i], data.user?.email ?? "Unknown"];
    }),
  );

  return rows.map((r) => ({
    user_id: r.user_id,
    org_role: r.org_role,
    display_name: nameByUserId.get(r.user_id) ?? "Unknown",
    email: emailByUserId.get(r.user_id) ?? "Unknown",
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

// Creates org + auth user + profile + owner membership in one call. Returns the temp
// password so the operator can share it out-of-band. Sets must_change_password so the
// agency owner is forced to pick their own password on first login. Best-effort cleanup
// if any step fails partway.
export async function createOrgWithOwner(input: {
  name: string;
  email: string;
  displayName: string;
  creditLimit: number | null;
}): Promise<{ orgId: string; userId: string; tempPassword: string }> {
  const supabase = createServerSupabase();

  const { data: existing, error: readErr } = await supabase
    .from("organizations")
    .select("slug");
  if (readErr) throw readErr;
  const slug = uniqueSlug(input.name, (existing ?? []).map((r: { slug: string }) => r.slug));

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name: input.name, slug, monthly_credit_limit: input.creditLimit })
    .select()
    .single();
  if (orgErr) throw orgErr;
  const orgId = (org as OrgRow).id;

  const tempPassword = generateTempPassword();
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { platform_role: "member", must_change_password: true },
  });
  if (userErr || !created.user) {
    await supabase.from("organizations").delete().eq("id", orgId);
    throw userErr ?? new Error("Failed to create user.");
  }
  const userId = created.user.id;

  const { error: profileErr } = await supabase
    .from("profiles")
    .insert({ user_id: userId, display_name: input.displayName });
  if (profileErr) {
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from("organizations").delete().eq("id", orgId);
    throw profileErr;
  }

  const { error: memberErr } = await supabase
    .from("org_memberships")
    .insert({ user_id: userId, org_id: orgId, org_role: "owner" });
  if (memberErr) {
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from("organizations").delete().eq("id", orgId);
    throw memberErr;
  }

  return { orgId, userId, tempPassword };
}

// R1.1/R1.2: add a SECOND (third, fourth…) seat to an existing org. Mirrors
// createOrgWithOwner's create-user -> profile -> membership sequence and its best-effort
// cleanup, deliberately — these are the same operation, differing only in whether the org
// already exists. Returns the temp password for out-of-band sharing;
// must_change_password forces the member to pick their own on first login, exactly as a
// freshly onboarded owner does.
//
// Note the unique index is `one_org_per_user` — one ORG PER USER, not one user per org.
// Multiple seats have always been legal here (D80); only a provisioning path was missing,
// because createOrgWithOwner hardcodes org_role: 'owner' and was the repo's only caller of
// auth.admin.createUser.
export async function addOrgMember(input: {
  orgId: string;
  email: string;
  displayName: string;
  orgRole: OrgRole;
}): Promise<{ userId: string; tempPassword: string }> {
  const supabase = createServerSupabase();

  // Confirm the org exists before creating an auth user we would then have to clean up.
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", input.orgId)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) throw new Error("Agency not found.");

  const tempPassword = generateTempPassword();
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { platform_role: "member", must_change_password: true },
  });
  if (userErr || !created.user) {
    throw userErr ?? new Error("Failed to create user.");
  }
  const userId = created.user.id;

  const { error: profileErr } = await supabase
    .from("profiles")
    .insert({ user_id: userId, display_name: input.displayName });
  if (profileErr) {
    await supabase.auth.admin.deleteUser(userId);
    throw profileErr;
  }

  const { error: memberErr } = await supabase
    .from("org_memberships")
    .insert({ user_id: userId, org_id: input.orgId, org_role: input.orgRole });
  if (memberErr) {
    // Leaving an auth user with no membership would strand them: they could sign in but
    // resolveCallerContext redirects to /login?error=no-membership forever.
    await supabase.auth.admin.deleteUser(userId);
    throw memberErr;
  }

  return { userId, tempPassword };
}

// R1.3. Verifies the membership belongs to THIS org before touching it — the same
// defense-in-depth resetMemberPassword applies against a tampered orgId/userId pair.
//
// R1.4 (an org must always retain an owner) is deliberately NOT enforced here: migration
// 0012's `org_memberships_last_owner` trigger already blocks demoting the final owner, and
// an invariant that must hold regardless of which code path attempts the write belongs in
// the database. The action surfaces the trigger's error rather than duplicating the rule
// where the two could drift apart.
export async function updateMemberRole(
  orgId: string,
  userId: string,
  orgRole: OrgRole,
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

  const { error } = await supabase
    .from("org_memberships")
    .update({ org_role: orgRole })
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (error) throw error;
}

// D181. Removes a member completely: membership, profile and auth user.
//
// Why the whole account and not just the membership: `one_org_per_user` means a member
// belongs to exactly one org, so detaching alone would leave an auth user who can still
// sign in but whose every request lands on /login?error=no-membership forever — the same
// stranded state addOrgMember's own rollback exists to prevent.
//
// Their WORK is not deleted. node_versions.operator_user_id / approved_by_user_id and
// node_version_decisions.decided_by_user_id are all `on delete set null`, so generations
// and review history survive and attribution degrades to "an unknown maker" (R11.4).
//
// Order matters. The membership row goes FIRST, because migration 0012's
// org_memberships_last_owner trigger vetoes removing an org's final owner — deleting it
// first means that veto lands before anything irreversible has happened, and its message
// surfaces verbatim (the same single-source-of-the-rule treatment updateMemberRole gives
// the demotion case).
export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  const supabase = createServerSupabase();

  const { data: membership, error: readErr } = await supabase
    .from("org_memberships")
    .select("user_id, org_role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!membership) throw new Error("Member not found in this agency.");

  const { org_role: orgRole } = membership as { org_role: string };

  const { error: memErr } = await supabase
    .from("org_memberships")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (memErr) throw memErr;

  // `profiles.user_id` cascades off auth.users (0012), so this clears the profile too.
  const { error: userErr } = await supabase.auth.admin.deleteUser(userId);
  if (userErr) {
    // Best-effort rollback, mirroring addOrgMember's own cleanup: without the membership
    // this user is stranded, which is strictly worse than never having removed them.
    await supabase
      .from("org_memberships")
      .insert({ user_id: userId, org_id: orgId, org_role: orgRole });
    throw userErr;
  }
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
