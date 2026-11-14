import type { InvitationForSignUp } from "@/lib/people/types";

export type InvitePageState =
  | { kind: "invalid" }
  | { kind: "wrong_email"; email: string }
  | { kind: "signed_in" }
  | { kind: "sign_up"; invitation: InvitationForSignUp };

/** Spec §6.3: what /invite/[token] shows, from the invitation and who (if anyone) is signed in. */
export function invitePageState(invitation: InvitationForSignUp | null, signedInEmail: string | null): InvitePageState {
  if (!invitation) return { kind: "invalid" };
  // Before the open check: coming back to a link they already used, signed in, goes home.
  if (signedInEmail && signedInEmail.toLowerCase() === invitation.email.toLowerCase()) return { kind: "signed_in" };
  if (!invitation.open) return { kind: "invalid" };
  if (signedInEmail) return { kind: "wrong_email", email: invitation.email };
  return { kind: "sign_up", invitation };
}
