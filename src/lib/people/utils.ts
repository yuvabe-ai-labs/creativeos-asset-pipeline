import { clientIdsWith } from "@/lib/permissions/check";
import type { Access } from "@/lib/permissions/model";
import type { AgencyPeople, AgencyPerson, OpenInvite } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** A client's Members list: the owner first (on every client), then the people on it. */
export function peopleOnClient(people: readonly AgencyPerson[], clientId: string): AgencyPerson[] {
  return [
    ...people.filter((p) => p.status === "owner"),
    ...people.filter((p) => p.status !== "owner" && p.clientIds.includes(clientId)),
  ];
}

/** The invite popup's "In your agency": everyone not on this client, people still waiting included. */
export function peopleNotOnClient(people: readonly AgencyPerson[], clientId: string): AgencyPerson[] {
  return people.filter((p) => p.status !== "owner" && !p.clientIds.includes(clientId));
}

export function signedUpPeople(people: readonly AgencyPerson[]): AgencyPerson[] {
  return people.filter((p) => p.status === "signed_up");
}

export function invitesForClient(invites: readonly OpenInvite[], clientId: string): OpenInvite[] {
  return invites.filter((i) => i.clientId === clientId);
}

/** The people read for a caller without manage_team (an Invite holder): no invite links. */
export function hideInviteLinks(invites: readonly OpenInvite[]): OpenInvite[] {
  return invites.map((i) => ({ ...i, link: null }));
}

/** The people read for an Invite holder (spec §6.2): only what their Members lists and invite
 *  popup need, for the clients where they hold Invite (`clientIds`). Invites to other clients are
 *  left out, a client they aren't on is never named, and agency permissions are withheld, so the
 *  read never confirms another client's name, invitees or members. */
export function inviteHolderView(read: AgencyPeople, clientIds: readonly string[]): AgencyPeople {
  const allowed = new Set(clientIds);
  return {
    people: read.people.map((p) => ({
      ...p,
      permissions: [],
      invitedClient: p.invitedClient && allowed.has(p.invitedClient.id) ? p.invitedClient : null,
      clientIds: p.clientIds.filter((id) => allowed.has(id)),
    })),
    invites: hideInviteLinks(read.invites.filter((i) => i.clientId !== null && allowed.has(i.clientId))),
  };
}

/** What a caller may read of the agency's people: the whole read with manage_team, otherwise
 *  the Invite holder's trimmed view for the clients where they hold Invite. Without manage_team the
 *  caller is never the owner, so clientIdsWith gives a list; an all-clients answer fails closed. */
export function peopleReadFor(
  read: AgencyPeople,
  { canManage, access, orgId }: { canManage: boolean; access: Access; orgId: string },
): AgencyPeople {
  if (canManage) return read;
  return inviteHolderView(read, clientIdsWith(access, orgId, "invite") ?? []);
}

/** The invite popup's Add: the chosen people who are still offered (not on the client, still in
 *  the agency), searched out of view or not, in the list's order. */
export function chosenStillEligible(chosen: ReadonlySet<string>, eligible: readonly AgencyPerson[]): string[] {
  return eligible.filter((p) => chosen.has(p.userId)).map((p) => p.userId);
}
