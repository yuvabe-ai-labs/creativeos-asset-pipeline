import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/slug";

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

// org_memberships and profiles both reference auth.users, but neither has a direct FK
// to the other — PostgREST can't auto-embed across that, so this is two queries + a
// JS join, not `profiles(display_name)`. Same pattern as resolveCallerContext (dal.ts).
export async function listOrgMembers(
  orgId: string,
): Promise<{ user_id: string; display_name: string; org_role: string }[]> {
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

  return rows.map((r) => ({
    user_id: r.user_id,
    org_role: r.org_role,
    display_name: nameByUserId.get(r.user_id) ?? "Unknown",
  }));
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
// password so the operator can share it out-of-band. No must_change_password (D84) —
// the agency owner just logs in with it. Best-effort cleanup if any step fails partway.
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
    app_metadata: { platform_role: "member" },
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

function generateTempPassword(): string {
  // 12 chars, guaranteed a letter + a number — a reasonable default even with no
  // forced-change flow to enforce strength at first login (D84).
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return "Cr" + out + "7";
}
