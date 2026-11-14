import type { InvitationForSignUp } from "@/lib/people/types";

export type InvitePageState =
  | { kind: "invalid" }
  | { kind: "wrong_email"; email: string }
  | { kind: "signed_in" }
  | { kind: "sign_up"; invitation: InvitationForSignUp };

/** Spec §6.3: what /invite/[token] shows, from the invitation and who (if anyone) is signed in. */
export function invitePageState(invitation: InvitationForSignUp | null, signedInEmail: string | null): InvitePageState {
  if (!invitation || !invitation.open) return { kind: "invalid" };
  if (signedInEmail && signedInEmail.toLowerCase() !== invitation.email.toLowerCase()) {
    return { kind: "wrong_email", email: invitation.email };
  }
  if (signedInEmail) return { kind: "signed_in" };
  return { kind: "sign_up", invitation };
}
