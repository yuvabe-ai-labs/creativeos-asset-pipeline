import type { Permission } from "@/lib/permissions/model";
import type { PersonStatus } from "./types";

/** Spec §6.7: a leaked session can't mass-mail. */
export const INVITES_PER_AGENCY_PER_DAY = 50;
export const INVITE_TTL_DAYS = 7;
/** Resend moves the invite's sent time to now, so the daily count sees it once however often it
 *  is resent: one resend a minute keeps a single invite from mailing on a loop. */
export const RESEND_GAP_MS = 60_000;

export const PERMISSION_LABELS: Record<Permission, string> = {
  generate: "Generate",
  approve: "Approve",
  share: "Share",
  delete: "Delete",
  invite: "Invite",
};

/** Spec §6.1: shown in place of the chips for a member with no permissions. */
export const NO_PERMISSIONS_LABEL = "Can look";

/** The owner's permissions, shown in place of the chips: they hold every one on every client. */
export const EVERY_PERMISSION_LABEL = "Everything";

/** What each Remove confirmation says it does (the Team page's menu, a Members list, the person
 *  panel), so the same removal reads the same wherever it is started. */
export const REMOVE_DETAILS = {
  fromAgency: "They lose access to every client of this agency at once, and their login is deleted.",
  waiting: "They haven't started yet. Their login is deleted and the invite link stops working.",
  fromClient: (client: string) =>
    `They come off ${client} only. They stay in the agency with their other clients and permissions.`,
} as const;

/** Spec §6.2, invite step 2: who sets the new person's permissions. */
export const INVITE_NEXT_STEP = {
  owner: "They get an email to sign up. Once they have, you set their permissions on the Team page.",
  inviter: "They get an email to sign up. Once they have, the owner sets their permissions on the Team page.",
} as const;

export const STATUS_LABELS: Record<PersonStatus | "invited", string> = {
  owner: "Owner",
  member: "Member",
  signed_up: "Signed up · Needs permissions",
  invited: "Invited",
};

/** Spec §6.2 refusals, and the plain messages the people routes answer with. */
export const REFUSALS = {
  invalidEmail: "Enter a valid email.",
  alreadyInAgency: (agency: string) => `Already in ${agency}. Add them from the list.`,
  alreadyInvited: (client: string) => `Already invited to ${client}. Once they've signed up, add them from the list.`,
  // For an Invite holder who isn't on the open invite's client: that client is not named.
  alreadyInvitedUnnamed: "Already invited. Once they've signed up, add them from the list.",
  otherAgency: "This email already belongs to another agency.",
  // A login that is in no agency (one login per person, D508): only we can move it.
  loginWithoutAgency: "This email already has a CreativeOS login. Ask Yuvabe to move it to your agency.",
  loginWithoutAgencyAdmin: "This email already has a CreativeOS login that isn't in any agency.",
  inviteJustSent: "That invite was just sent. Try again in a minute.",
  notOnClient: "That person isn't on this client.",
  dailyLimit: `You've sent ${INVITES_PER_AGENCY_PER_DAY} invites today. Try again tomorrow.`,
  ownerFixed: "The agency owner can't be removed.",
  ownerPermissions: "The agency owner has every permission already.",
  personNotFound: "That person isn't in this agency.",
  inviteNotFound: "That invite isn't open any more.",
  inviteInvalid: "This invite link is no longer valid.",
  // One agency per person: someone signed in as another email usually signs out and creates the
  // invited account, rather than signing in to one they already have.
  inviteOtherAccount: (email: string) => `This invite is for ${email}. Sign out, then create your account with that email.`,
  tryAgain: "Something went wrong. Try again.",
  ownerInviteOpen: "This agency already has an owner or an open owner invite.",
  alreadyInAgencyMakeOwner: (agency: string) => `Already in ${agency}. Make them owner from the agency's People tab.`,
} as const;
