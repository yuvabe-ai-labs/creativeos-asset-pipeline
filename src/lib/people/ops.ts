import "server-only";
import * as people from "@/lib/db/people";
import { sendEmail, type Email } from "@/lib/email/send";
import { accessReadyEmail, appLink, memberInviteEmail, ownerInviteEmail, signedUpEmail } from "@/lib/email/templates";
import { inviteLink, isFullInviteLink, newInviteToken } from "@/lib/invites/token";
import { orderedPermissions, toPermissionSet, type Permission } from "@/lib/permissions/model";
import { uniqueSlug } from "@/lib/slug";
import { INVITES_PER_AGENCY_PER_DAY, REFUSALS, RESEND_GAP_MS } from "./constants";
import type { InviteResult, StoredInvite } from "./types";
import { isValidEmail, normaliseEmail } from "./utils";

// The people rules (spec §6.1–§6.3, §6.6), once for the owner's screens, Invite holders and
// Admin. Callers have already checked, in withTeam, invite on the client (inviteToClient,
// addToClient) or manage_team (everything else), or the super admin (requireSuperAdmin). The
// inviter recorded and named is always the actual caller (`by`). Refusals are
// returned with the spec's words; database faults throw and the route answers plainly.

export type OpResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409 | 429; error: string };
export type Agency = { orgId: string; orgName: string };
export type Actor = { userId: string; name: string };

const ok = <T>(value: T): OpResult<T> => ({ ok: true, value });
const refuse = (status: 400 | 404 | 409 | 429, error: string): OpResult<never> => ({ ok: false, status, error });

/** Spec §6.7: the email step never fails the action that asked for it. Building the email
 *  (appLink throws without APP_URL) happens inside the guard; false means "show the link". */
async function emailGuarded(build: () => Email): Promise<boolean> {
  try {
    return (await sendEmail(build())).sent;
  } catch (e) {
    console.error("[people] could not send the email", e);
    return false;
  }
}

/** An invite email, unless the link is a path only (APP_URL not set): then it is shown to copy. */
async function emailInvite(link: string, build: () => Email): Promise<boolean> {
  if (!isFullInviteLink(link)) {
    console.error("[people] APP_URL is not set; the invite link is a path only and is not emailed");
    return false;
  }
  return emailGuarded(build);
}

/** The refusal for an email that already has a login elsewhere or an open invite in another
 *  agency (one agency per person, D508; the other agency is never named). Null: free to invite. */
function loginOrInviteElsewhere(
  login: { orgId: string | null } | null,
  openElsewhere: boolean,
  noAgencyMessage: string,
): OpResult<never> | null {
  if (login) return refuse(409, login.orgId === null ? noAgencyMessage : REFUSALS.otherAgency);
  if (openElsewhere) return refuse(409, REFUSALS.otherAgency);
  return null;
}

/** Postgres unique violation: here, the one-open-invite-per-email index. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505";
}

/** "Already invited", naming the open invite's client only when the caller may see it:
 *  `namedClientIds` null names any client (the owner, Admin); an Invite holder passes the clients
 *  they are on, so they never learn another client's name (D511). */
function alreadyInvited(
  open: { clientId: string | null; clientName: string | null } | null,
  agency: Agency,
  namedClientIds: readonly string[] | null,
): OpResult<never> {
  if (namedClientIds === null) return refuse(409, REFUSALS.alreadyInvited(open?.clientName ?? agency.orgName));
  if (open?.clientId && open.clientName && namedClientIds.includes(open.clientId)) {
    return refuse(409, REFUSALS.alreadyInvited(open.clientName));
  }
  return refuse(409, REFUSALS.alreadyInvitedUnnamed);
}

export async function inviteToClient(
  agency: Agency,
  client: { id: string; name: string },
  rawEmail: string,
  by: Actor,
  namedClientIds: readonly string[] | null = null,
): Promise<OpResult<InviteResult>> {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return refuse(400, REFUSALS.invalidEmail);
  const [login, open, openElsewhere] = await Promise.all([
    people.findLoginByEmail(email),
    people.findOpenInviteByEmail(agency.orgId, email),
    people.hasOpenInviteElsewhere(email, agency.orgId),
  ]);
  if (login?.orgId === agency.orgId) return refuse(409, REFUSALS.alreadyInAgency(agency.orgName));
  if (open) return alreadyInvited(open, agency, namedClientIds);
  // One agency per person (D508): any other login can't join from the link, and of two open
  // invites in two agencies the second accepted would fail at sign-up.
  const elsewhere = loginOrInviteElsewhere(login, openElsewhere, REFUSALS.loginWithoutAgency);
  if (elsewhere) return elsewhere;
  // Last, so a refused invite never uses up a send.
  if (!(await people.takeInviteSend(agency.orgId, INVITES_PER_AGENCY_PER_DAY))) return refuse(429, REFUSALS.dailyLimit);

  let stored: StoredInvite;
  try {
    stored = await people.insertInvitation({ orgId: agency.orgId, clientId: client.id, email, token: newInviteToken(), invitedBy: by.userId });
  } catch (e) {
    // Someone else invited this email between the check above and the insert.
    if (!isUniqueViolation(e)) throw e;
    const winner = await people.findOpenInviteByEmail(agency.orgId, email);
    return alreadyInvited(winner, agency, namedClientIds);
  }
  const invite = { ...stored, invitedByName: by.name };
  const link = invite.link;
  const emailed = await emailInvite(link, () => memberInviteEmail({ to: email, agency: agency.orgName, inviter: by.name, client: client.name, link }));
  return ok({ invite, link, emailed });
}

/** Resend: a new token (the old link stops working), emailed, and one send from the daily limit,
 *  taken before the token is replaced so no new link is issued past the limit. A Resend refused
 *  within a minute of the last send has still used its send, which only matters to someone
 *  resending on a loop. Copy link is not here: it shows the stored link (OpenInvite.link) and
 *  makes no request. */
export async function resendInvite(agency: Agency, inviteId: string, by: Actor): Promise<OpResult<InviteResult>> {
  // The gap and the invite being open are checked before a send is taken, so a refused Resend
  // doesn't use up one of the day's sends.
  const lastSent = await people.openInviteSentAt(agency.orgId, inviteId);
  if (!lastSent) return refuse(404, REFUSALS.inviteNotFound);
  const sentBefore = Date.now() - RESEND_GAP_MS;
  if (Date.parse(lastSent) > sentBefore) return refuse(429, REFUSALS.inviteJustSent);
  if (!(await people.takeInviteSend(agency.orgId, INVITES_PER_AGENCY_PER_DAY))) return refuse(429, REFUSALS.dailyLimit);
  // The replace re-checks the gap in the same update, so two Resends at once can't both go out.
  const invite = await people.replaceInvitationToken(agency.orgId, inviteId, newInviteToken(), new Date(sentBefore).toISOString());
  if (!invite) return refuse(429, REFUSALS.inviteJustSent);
  const link = invite.link;
  const emailed = await emailInvite(link, () =>
    invite.asOwner
      ? ownerInviteEmail({ to: invite.email, agency: agency.orgName, link })
      : memberInviteEmail({ to: invite.email, agency: agency.orgName, inviter: by.name, client: invite.clientName ?? agency.orgName, link }),
  );
  return ok({ invite, link, emailed });
}

export async function cancelInvite(agency: Agency, inviteId: string): Promise<OpResult<{ email: string }>> {
  const email = await people.revokeInvitation(agency.orgId, inviteId);
  return email ? ok({ email }) : refuse(404, REFUSALS.inviteNotFound);
}

/** Give access (first time) or edit. The cascade carries the set onto every client row. */
export async function updatePermissions(agency: Agency, userId: string, permissions: Permission[], giveAccess: boolean): Promise<OpResult<{ emailed: boolean }>> {
  const member = await people.getMembership(agency.orgId, userId);
  if (!member) return refuse(404, REFUSALS.personNotFound);
  if (member.isOwner) return refuse(409, REFUSALS.ownerPermissions);
  const firstAccess = giveAccess && !member.accessGiven;
  await people.setMemberPermissions(agency.orgId, userId, orderedPermissions(toPermissionSet(permissions)), firstAccess);
  if (!firstAccess) return ok({ emailed: false });
  const [to] = await people.loginEmails([userId]);
  if (!to) return ok({ emailed: false });
  const emailed = await emailGuarded(() => accessReadyEmail({ to, agency: agency.orgName, link: appLink("/") }));
  return ok({ emailed });
}

export async function removePerson(agency: Agency, userId: string): Promise<OpResult<null>> {
  const member = await people.getMembership(agency.orgId, userId);
  if (!member) return refuse(404, REFUSALS.personNotFound);
  if (member.isOwner) return refuse(409, REFUSALS.ownerFixed);
  await people.deleteMembership(agency.orgId, userId);
  await people.deleteLogin(userId);
  return ok(null);
}

export async function addToClient(agency: Agency, clientId: string, userIds: string[], by: Actor): Promise<OpResult<{ added: number }>> {
  const unique = [...new Set(userIds)];
  const found = await people.getMemberships(agency.orgId, unique);
  if (found.length !== unique.length) return refuse(404, REFUSALS.personNotFound);
  // The owner is on every client already and never has a row.
  const toAdd = found.filter((m) => !m.isOwner).map((m) => m.userId);
  if (toAdd.length > 0) await people.addPeopleToClient(agency.orgId, clientId, toAdd, by.userId);
  return ok({ added: toAdd.length });
}

/** Off this client only: they stay in the agency with their other clients and permissions. */
export async function removeFromClient(agency: Agency, clientId: string, userId: string): Promise<OpResult<null>> {
  // Nothing removed: unknown, the owner (never has a row) or not on this client.
  const removed = await people.removePersonFromClient(agency.orgId, clientId, userId);
  return removed ? ok(null) : refuse(404, REFUSALS.notOnClient);
}

export async function makeOwner(agency: Agency, userId: string): Promise<OpResult<null>> {
  const member = await people.getMembership(agency.orgId, userId);
  if (!member) return refuse(404, REFUSALS.personNotFound);
  if (!member.isOwner) await people.transferOwner(agency.orgId, userId);
  return ok(null);
}

export async function createAgency(name: string, rawEmail: string, by: Actor): Promise<OpResult<{ orgId: string; link: string; emailed: boolean }>> {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return refuse(400, REFUSALS.invalidEmail);
  const [login, openElsewhere, slugs] = await Promise.all([
    people.findLoginByEmail(email),
    people.hasOpenInviteElsewhere(email, null),
    people.listOrgSlugs(),
  ]);
  const elsewhere = loginOrInviteElsewhere(login, openElsewhere, REFUSALS.loginWithoutAgencyAdmin);
  if (elsewhere) return elsewhere;
  // No send is taken from the daily limit: the agency is brand new, and this is its first send.
  const token = newInviteToken();
  const orgId = await people.createAgencyWithOwnerInvite({ name, slug: uniqueSlug(name, slugs), ownerEmail: email, token, by: by.userId });
  // Without APP_URL the link is its path (shown to copy on this site) and is not emailed.
  const link = inviteLink(token);
  const emailed = await emailInvite(link, () => ownerInviteEmail({ to: email, agency: name, link }));
  return ok({ orgId, link, emailed });
}

export async function resendOwnerInvite(agency: Agency, by: Actor): Promise<OpResult<InviteResult>> {
  const open = await people.getOpenOwnerInvite(agency.orgId);
  if (!open) return refuse(404, REFUSALS.inviteNotFound);
  return resendInvite(agency, open.id, by);
}

/** Admin's Invite an owner (spec §6.6, D505): for an existing agency with no owner and no open
 *  owner invite. The same refusals as Add an agency and an invite (another login, already invited,
 *  the daily limit); the link is emailed when it can be and always returned to copy. */
export async function inviteOwner(agency: Agency, rawEmail: string, by: Actor): Promise<OpResult<InviteResult>> {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return refuse(400, REFUSALS.invalidEmail);
  const [login, owners, openOwner, open, openElsewhere] = await Promise.all([
    people.findLoginByEmail(email),
    people.ownerIds(agency.orgId),
    people.getOpenOwnerInvite(agency.orgId),
    people.findOpenInviteByEmail(agency.orgId, email),
    people.hasOpenInviteElsewhere(email, agency.orgId),
  ]);
  if (owners.length > 0 || openOwner) return refuse(409, REFUSALS.ownerInviteOpen);
  if (login?.orgId === agency.orgId) return refuse(409, REFUSALS.alreadyInAgencyMakeOwner(agency.orgName));
  const elsewhere = loginOrInviteElsewhere(login, openElsewhere, REFUSALS.loginWithoutAgencyAdmin);
  if (elsewhere) return elsewhere;
  if (open) return refuse(409, REFUSALS.alreadyInvited(open.clientName ?? agency.orgName));
  if (!(await people.takeInviteSend(agency.orgId, INVITES_PER_AGENCY_PER_DAY))) return refuse(429, REFUSALS.dailyLimit);

  let stored: StoredInvite;
  try {
    stored = await people.insertOwnerInvitation({ orgId: agency.orgId, email, token: newInviteToken(), invitedBy: by.userId });
  } catch (e) {
    // Another owner invite went in between the check above and the insert.
    if (!isUniqueViolation(e)) throw e;
    return refuse(409, REFUSALS.ownerInviteOpen);
  }
  const invite = { ...stored, invitedByName: by.name };
  const link = invite.link;
  const emailed = await emailInvite(link, () => ownerInviteEmail({ to: email, agency: agency.orgName, link }));
  return ok({ invite, link, emailed });
}

/** Spec §6.3: when a member signs up, the owner and whoever invited them are told, one email
 *  each (one only when the owner invited them). The owner's adds the Team page line. Best effort. */
export async function notifySignedUp(a: { orgId: string; orgName: string; userId: string; name: string; invitedBy: string | null }): Promise<void> {
  try {
    const owners = await people.ownerIds(a.orgId);
    const inviter = a.invitedBy && !owners.includes(a.invitedBy) ? a.invitedBy : null;
    const [ownerTo, inviterTo] = await Promise.all([
      people.loginEmails(owners),
      inviter ? people.loginEmails([inviter]) : Promise.resolve([] as string[]),
    ]);
    const base = { name: a.name, agency: a.orgName };
    await Promise.all([
      ownerTo.length > 0 ? emailGuarded(() => signedUpEmail({ ...base, to: ownerTo, link: appLink(`/team?person=${a.userId}`), forOwner: true })) : null,
      inviterTo.length > 0 ? emailGuarded(() => signedUpEmail({ ...base, to: inviterTo, link: appLink("/"), forOwner: false })) : null,
    ]);
  } catch (e) {
    console.error("[invite] could not send the signed-up notice", e);
  }
}
