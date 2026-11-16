import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { unwrapEmbed, type Embed } from "@/lib/db/embed";
import { orderedPermissions, toPermissionSet, type Permission } from "@/lib/permissions/model";
import { inviteLink } from "@/lib/invites/token";
import { INVITE_TTL_DAYS } from "@/lib/people/constants";
import type { AgencyPerson, InvitationForSignUp, StoredInvite } from "@/lib/people/types";

// Every read and write of people and invitations (migration 0062). The rules (who may, the
// refusals, the emails) are in src/lib/people/ops.ts; nothing here decides access. Invite tokens
// are stored as issued; they leave the server only to the owner or the super admin (the people
// read passes invites through hideInviteLinks for anyone without manage_team), to the person who
// just sent that invite, and in the invited person's email.

type PeopleRow = {
  user_id: string;
  display_name: string;
  email: string;
  is_owner: boolean;
  access_given_at: string | null;
  permissions: string[] | null;
  joined_at: string;
  invited_by_name: string | null;
  invited_client_id: string | null;
  invited_client_name: string | null;
  client_ids: string[] | null;
};

type InviteRow = {
  id: string;
  email: string;
  client_id: string | null;
  as_owner: boolean;
  created_at: string;
  expires_at: string;
  token: string;
  /** Only where the inviter is named (INVITE_COLUMNS_WITH_INVITER). */
  invited_by?: string | null;
  clients: Embed<{ name: string }>;
};

const INVITE_COLUMNS = "id, email, client_id, as_owner, created_at, expires_at, token, clients(name)";
const INVITE_COLUMNS_WITH_INVITER = `${INVITE_COLUMNS}, invited_by`;

export function toPerson(row: PeopleRow): AgencyPerson {
  return {
    userId: row.user_id,
    name: row.display_name,
    email: row.email,
    status: row.is_owner ? "owner" : row.access_given_at ? "member" : "signed_up",
    permissions: orderedPermissions(toPermissionSet(row.permissions)),
    joinedAt: row.joined_at,
    invitedByName: row.invited_by_name,
    invitedClient: row.invited_client_id && row.invited_client_name ? { id: row.invited_client_id, name: row.invited_client_name } : null,
    clientIds: row.client_ids ?? [],
  };
}

export function toInvite(row: InviteRow, invitedByName: string | null = null): StoredInvite {
  return {
    id: row.id,
    email: row.email,
    clientId: row.client_id,
    clientName: unwrapEmbed(row.clients)?.name ?? null,
    asOwner: row.as_owner,
    sentAt: row.created_at,
    expiresAt: row.expires_at,
    invitedByName,
    link: inviteLink(row.token),
  };
}

function expiry(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function listAgencyPeople(orgId: string): Promise<AgencyPerson[]> {
  const { data, error } = await createServerSupabase().rpc("list_agency_people", { p_org_id: orgId });
  if (error) throw error;
  return ((data ?? []) as PeopleRow[]).map(toPerson);
}

type Db = ReturnType<typeof createServerSupabase>;

/** Maps invites to StoredInvites with who sent each. invited_by references auth.users, so
 *  PostgREST can't embed the profile: one batched profiles read for the distinct inviters. */
async function withInviterNames(db: Db, rows: InviteRow[]): Promise<StoredInvite[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.invited_by ? [r.invited_by] : [])))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data, error } = await db.from("profiles").select("user_id, display_name").in("user_id", ids);
    if (error) throw error;
    for (const p of (data ?? []) as { user_id: string; display_name: string }[]) names.set(p.user_id, p.display_name);
  }
  return rows.map((r) => toInvite(r, (r.invited_by && names.get(r.invited_by)) || null));
}

export async function listOpenInvites(orgId: string): Promise<StoredInvite[]> {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("org_invitations")
    .select(INVITE_COLUMNS_WITH_INVITER)
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return withInviterNames(db, (data ?? []) as unknown as InviteRow[]);
}

export async function getMembership(orgId: string, userId: string): Promise<{ isOwner: boolean; accessGiven: boolean } | null> {
  const { data, error } = await createServerSupabase()
    .from("org_memberships")
    .select("is_owner, access_given_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { is_owner: boolean; access_given_at: string | null } | null;
  return row ? { isOwner: row.is_owner, accessGiven: row.access_given_at !== null } : null;
}

export async function getMemberships(orgId: string, userIds: readonly string[]): Promise<{ userId: string; isOwner: boolean }[]> {
  const { data, error } = await createServerSupabase()
    .from("org_memberships")
    .select("user_id, is_owner")
    .eq("org_id", orgId)
    .in("user_id", [...userIds]);
  if (error) throw error;
  return ((data ?? []) as { user_id: string; is_owner: boolean }[]).map((r) => ({ userId: r.user_id, isOwner: r.is_owner }));
}

/** One update; the cascade trigger carries the change onto every client row (spec §3.3). */
export async function setMemberPermissions(orgId: string, userId: string, permissions: Permission[], giveAccess: boolean): Promise<void> {
  const { error } = await createServerSupabase()
    .from("org_memberships")
    .update(giveAccess ? { permissions, access_given_at: new Date().toISOString() } : { permissions })
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("is_owner", false);
  if (error) throw error;
}

/** One insert; each row copies the person's agency set (trigger). Already on the client: kept. */
export async function addPeopleToClient(orgId: string, clientId: string, userIds: readonly string[], by: string): Promise<void> {
  const rows = userIds.map((user_id) => ({ user_id, org_id: orgId, client_id: clientId, added_by: by }));
  const { error } = await createServerSupabase()
    .from("membership_clients")
    .upsert(rows, { onConflict: "user_id,org_id,client_id", ignoreDuplicates: true });
  if (error) throw error;
}

/** True when a row was removed. False: not on this client (the owner never has a row). */
export async function removePersonFromClient(orgId: string, clientId: string, userId: string): Promise<boolean> {
  const { data, error } = await createServerSupabase()
    .from("membership_clients")
    .delete()
    .eq("org_id", orgId)
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

/** The header's Team count (spec §6.1). */
export async function countSignedUp(orgId: string): Promise<number> {
  const { count, error } = await createServerSupabase()
    .from("org_memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_owner", false)
    .is("access_given_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function ownerIds(orgId: string): Promise<string[]> {
  const { data, error } = await createServerSupabase()
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("is_owner", true);
  if (error) throw error;
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}

/** Emails live only in auth.users. Called for one to three people at a time (the notices). */
export async function loginEmails(userIds: readonly string[]): Promise<string[]> {
  const db = createServerSupabase();
  const users = await Promise.all(userIds.map((id) => db.auth.admin.getUserById(id)));
  // Nothing destructive follows (a notice is skipped), so a failed read leaves that person out.
  return users.flatMap(({ data, error }, i) => {
    if (error) {
      console.error("[people] could not read a login's email", userIds[i], error.message);
      return [];
    }
    return data.user?.email ? [data.user.email] : [];
  });
}

export async function findLoginByEmail(email: string): Promise<{ userId: string; orgId: string | null } | null> {
  const { data, error } = await createServerSupabase().rpc("find_user_by_email", { p_email: email });
  if (error) throw error;
  const row = ((data ?? []) as { user_id: string; org_id: string | null }[])[0];
  return row ? { userId: row.user_id, orgId: row.org_id } : null;
}

export async function createLogin(
  email: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: "email_exists" | "failed" }> {
  const { data, error } = await createServerSupabase().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { platform_role: "member" },
  });
  if (error || !data.user) {
    // The Auth admin API answers an address that already has a login with code "email_exists"
    // (422); "user_already_exists" is the same case from older Auth versions.
    const code = (error as { code?: string } | null)?.code;
    if (code === "email_exists" || code === "user_already_exists") return { ok: false, reason: "email_exists" };
    console.error("[invite] could not create the login:", code ?? "no code", error?.message ?? "no user returned");
    return { ok: false, reason: "failed" };
  }
  return { ok: true, userId: data.user.id };
}

/** Takes a member out of the agency: the membership and, by cascade, their client rows. Never the
 *  owner (is_owner = false). Run before deleteLogin: deleting the login alone fails, because the
 *  cascade from auth.users runs the membership triggers as the Auth service role, which cannot
 *  read org_memberships. */
export async function deleteMembership(orgId: string, userId: string): Promise<void> {
  const { error } = await createServerSupabase()
    .from("org_memberships")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("is_owner", false);
  if (error) throw error;
}

/** Deletes the login; the profile goes with it (cascade). Their work stays, unattributed. A login
 *  that still has a membership must lose it first (deleteMembership). */
export async function deleteLogin(userId: string): Promise<void> {
  const { error } = await createServerSupabase().auth.admin.deleteUser(userId);
  if (error) throw error;
}

/** An unexpired open invite to this email. An expired one is not "already invited": inviting
 *  again replaces it (insertInvitation revokes it first). */
export async function findOpenInviteByEmail(orgId: string, email: string): Promise<{ id: string; clientId: string | null; clientName: string | null } | null> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .select("id, client_id, clients(name)")
    .eq("org_id", orgId)
    // Stored lowercased (normaliseEmail, and lower() in create_agency_with_owner_invite); eq, not
    // ilike, so an underscore in an address is not a wildcard.
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as { id: string; client_id: string | null; clients: Embed<{ name: string }> };
  return { id: row.id, clientId: row.client_id, clientName: unwrapEmbed(row.clients)?.name ?? null };
}

/** One agency per person (D508): an open, unexpired invite to this email in another agency
 *  (any agency when exceptOrgId is null, for a new one). Only whether there is one: the caller
 *  must not learn which agency. A failed read throws; it is never "none". */
export async function hasOpenInviteElsewhere(email: string, exceptOrgId: string | null): Promise<boolean> {
  let query = createServerSupabase()
    .from("org_invitations")
    .select("id")
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  if (exceptOrgId) query = query.neq("org_id", exceptOrgId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

/** Takes one invite send from the agency's daily limit (0063 `take_invite_send`): true when it is
 *  allowed and counted, false once `limit` sends are used. One atomic update on the agency row, so
 *  two concurrent sends at the last slot can't both pass. The window is a fixed 24 hours from its
 *  first send, not a rolling one, which is fine for a limit that only stops abuse. */
export async function takeInviteSend(orgId: string, limit: number): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("take_invite_send", { p_org_id: orgId, p_limit: limit });
  if (error) throw error;
  return data === true;
}

/** The invite comes back with invitedByName null: the caller knows who it is (ops fills it in).
 *  A unique violation (23505, a concurrent invite to the same email) is thrown as is; the people
 *  rules turn it into the "already invited" refusal.
 *  An expired invite still counts as open to the one-open-invite-per-email index (an index can't
 *  use now()), so it is revoked first; otherwise it would block every new invite to that email. */
export async function insertInvitation(i: { orgId: string; clientId: string; email: string; token: string; invitedBy: string }): Promise<StoredInvite> {
  return insertOpenInvite({ ...i, asOwner: false });
}

/** Admin's Invite an owner for an agency that has neither an owner nor an open owner invite
 *  (spec §6.6). No client; a concurrent one hits the one-open-owner-invite index (23505). */
export async function insertOwnerInvitation(i: { orgId: string; email: string; token: string; invitedBy: string }): Promise<StoredInvite> {
  return insertOpenInvite({ ...i, clientId: null, asOwner: true });
}

async function insertOpenInvite(i: { orgId: string; clientId: string | null; asOwner: boolean; email: string; token: string; invitedBy: string }): Promise<StoredInvite> {
  const db = createServerSupabase();
  const now = new Date().toISOString();
  const { error: revokeError } = await db
    .from("org_invitations")
    .update({ revoked_at: now })
    .eq("org_id", i.orgId)
    .eq("email", i.email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lte("expires_at", now);
  if (revokeError) throw revokeError;
  const { data, error } = await db
    .from("org_invitations")
    .insert({ org_id: i.orgId, client_id: i.clientId, as_owner: i.asOwner, email: i.email, token: i.token, invited_by: i.invitedBy, expires_at: expiry() })
    .select(INVITE_COLUMNS)
    .single();
  if (error) throw error;
  return toInvite(data as unknown as InviteRow);
}

/** Resend only: a new token (the old link stops working), sent now, 7 more days. Copy link never
 *  calls this; it shows the stored link. Only an invite last sent at or before `sentBefore` is
 *  replaced, so two quick resends can't both go through; null when none was (see openInviteSentAt). */
export async function replaceInvitationToken(orgId: string, inviteId: string, token: string, sentBefore: string): Promise<StoredInvite | null> {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("org_invitations")
    .update({ token, created_at: new Date().toISOString(), expires_at: expiry() })
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lte("created_at", sentBefore)
    .select(INVITE_COLUMNS_WITH_INVITER)
    .maybeSingle();
  if (error) throw error;
  // Resend keeps the original sender.
  return data ? (await withInviterNames(db, [data as unknown as InviteRow]))[0] : null;
}

/** Whether the invite is still open in this agency: tells "just sent" from "gone" after a
 *  Resend replaced nothing. */
/** When an open invite was last sent (created_at moves on each Resend); null when it isn't open. */
export async function openInviteSentAt(orgId: string, inviteId: string): Promise<string | null> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .select("created_at")
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as { created_at: string } | null)?.created_at ?? null;
}

/** Revokes an open invite; answers who it was for (the audit log names them), null when none was open. */
export async function revokeInvitation(orgId: string, inviteId: string): Promise<string | null> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("email");
  if (error) throw error;
  return (data as { email: string }[] | null)?.[0]?.email ?? null;
}

/** Read for its id (resendOwnerInvite); invitedByName is left null. */
export async function getOpenOwnerInvite(orgId: string): Promise<StoredInvite | null> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .select(INVITE_COLUMNS)
    .eq("org_id", orgId)
    .eq("as_owner", true)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toInvite(data as unknown as InviteRow) : null;
}

type SignUpRow = {
  id: string;
  org_id: string;
  email: string;
  as_owner: boolean;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  invited_by: string | null;
  organizations: Embed<{ name: string }>;
  clients: Embed<{ name: string }>;
};

export async function getInvitationByToken(token: string): Promise<InvitationForSignUp | null> {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("org_invitations")
    .select("id, org_id, email, as_owner, accepted_at, revoked_at, expires_at, invited_by, organizations(name), clients(name)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as SignUpRow;
  let inviterName: string | null = null;
  if (row.invited_by) {
    const { data: profile, error: profileError } = await db.from("profiles").select("display_name").eq("user_id", row.invited_by).maybeSingle();
    if (profileError) throw profileError;
    inviterName = (profile as { display_name: string } | null)?.display_name ?? null;
  }
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: unwrapEmbed(row.organizations)?.name ?? "",
    email: row.email,
    asOwner: row.as_owner,
    clientName: unwrapEmbed(row.clients)?.name ?? null,
    inviterName,
    open: !row.accepted_at && !row.revoked_at && new Date(row.expires_at).getTime() > Date.now(),
  };
}

/** The caller must have created `userId`'s login with the invitation's own email (the sign-up
 *  action does, from getInvitationByToken, never from the form): accept_invitation does not
 *  compare the two. Null when the link is no longer valid; any other failure throws, so a
 *  passing outage is not mistaken for a dead link. */
export async function acceptInvitation(
  token: string,
  userId: string,
  displayName: string,
): Promise<{ orgId: string; clientId: string | null; asOwner: boolean; invitedBy: string | null } | null> {
  const { data, error } = await createServerSupabase().rpc("accept_invitation", {
    p_token: token,
    p_user_id: userId,
    p_display_name: displayName,
  });
  // P0002 (no_data_found): the function's own "no longer valid" (used, revoked or expired).
  if (error?.code === "P0002") return null;
  if (error) throw error;
  const row = ((data ?? []) as { org_id: string; client_id: string | null; as_owner: boolean; invited_by: string | null }[])[0];
  if (!row) return null;
  return { orgId: row.org_id, clientId: row.client_id, asOwner: row.as_owner, invitedBy: row.invited_by };
}

export async function transferOwner(orgId: string, userId: string): Promise<void> {
  const { error } = await createServerSupabase().rpc("transfer_agency_owner", { p_org_id: orgId, p_new_owner: userId });
  if (error) throw error;
}

export async function createAgencyWithOwnerInvite(a: { name: string; slug: string; ownerEmail: string; token: string; by: string }): Promise<string> {
  const { data, error } = await createServerSupabase().rpc("create_agency_with_owner_invite", {
    p_name: a.name,
    p_slug: a.slug,
    p_owner_email: a.ownerEmail,
    p_token: a.token,
    p_by: a.by,
  });
  if (error) throw error;
  return data as string;
}

export async function listOrgSlugs(): Promise<string[]> {
  const { data, error } = await createServerSupabase().from("organizations").select("slug");
  if (error) throw error;
  return ((data ?? []) as { slug: string }[]).map((r) => r.slug);
}
