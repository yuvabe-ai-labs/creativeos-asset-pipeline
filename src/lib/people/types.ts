import type { Permission } from "@/lib/permissions/model";

/** Spec §2.4. An open invite is the fourth status, "invited". */
export type PersonStatus = "owner" | "member" | "signed_up";

export type AgencyPerson = {
  userId: string;
  name: string;
  email: string;
  status: PersonStatus;
  /** The agency-level set (what the owner edits on the Team page). */
  permissions: Permission[];
  joinedAt: string;
  invitedByName: string | null;
  /** The client they were invited to, once they have signed up. */
  invitedClient: { id: string; name: string } | null;
  /** The clients they are on, oldest first. Empty for the owner (on every client). */
  clientIds: string[];
};

export type OpenInvite = {
  id: string;
  email: string;
  clientId: string | null;
  clientName: string | null;
  asOwner: boolean;
  sentAt: string;
  expiresAt: string;
  /** Who sent it (spec §6.1), by display name. Null when that login is gone. */
  invitedByName: string | null;
  /** The link as issued: Copy link shows it unchanged; only Resend replaces it. Null for a
   *  caller without manage_team (an Invite holder): links reach only the owner and Admin. */
  link: string | null;
};

/** An invite as the data layer reads it, always with its link (src/lib/db/people.ts). */
export type StoredInvite = OpenInvite & { link: string };

/** The one people resource per agency: the Team page, every Members list, the invite popup. */
export type AgencyPeople = { people: AgencyPerson[]; invites: OpenInvite[] };

/** `emailed` false: email is not set up or the send failed; show the link to copy. */
export type InviteResult = { invite: StoredInvite; link: string; emailed: boolean };

export type InvitationForSignUp = {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
  asOwner: boolean;
  clientName: string | null;
  inviterName: string | null;
  /** Not accepted, not revoked, not expired. */
  open: boolean;
};
