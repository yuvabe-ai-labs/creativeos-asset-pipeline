import type { Permission } from "@/lib/permissions/model";
import type { PersonStatus } from "./types";

/** Spec §6.7: a leaked session can't mass-mail. */
export const INVITES_PER_AGENCY_PER_DAY = 50;
export const INVITE_TTL_DAYS = 7;

export const PERMISSION_LABELS: Record<Permission, string> = {
  generate: "Generate",
  approve: "Approve",
  share: "Share",
  delete: "Delete",
  invite: "Invite",
};

/** Spec §6.1: shown in place of the chips for a member with no permissions. */
export const NO_PERMISSIONS_LABEL = "Can look";

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
  otherAgency: "This email already belongs to another agency.",
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
