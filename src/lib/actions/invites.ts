"use server";

import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { acceptInvitation, createLogin, deleteLogin, getInvitationByToken } from "@/lib/db/people";
import { notifySignedUp } from "@/lib/people/ops";
import { REFUSALS } from "@/lib/people/constants";
import { AcceptInviteSchema } from "@/lib/people/schema";

export type AcceptInviteState = { error?: string } | undefined;

/** The error's message only: never the request, its arguments or the token. */
function errorMessage(e: unknown): string {
  return typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : "unknown error";
}

// Spec §6.3. Runs before any account exists: the token is the capability (allowlisted in
// with-action-coverage.test.ts). The email comes from the invitation, never the form.
export async function acceptInviteAction(token: string, _prev: AcceptInviteState, formData: FormData): Promise<AcceptInviteState> {
  const parsed = AcceptInviteSchema.safeParse({ name: formData.get("name") ?? "", password: formData.get("password") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your name and password." };

  const invitation = await getInvitationByToken(token);
  if (!invitation?.open) return { error: REFUSALS.inviteInvalid };

  const login = await createLogin(invitation.email, parsed.data.password);
  if (!login.ok) return { error: REFUSALS.otherAgency };

  let accepted: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    // Single use: marks the invite accepted in the same transaction as the membership and row.
    accepted = await acceptInvitation(token, login.userId, parsed.data.name);
  } catch (e) {
    console.error("[invite] accept failed; removing the new login:", errorMessage(e));
    try {
      await deleteLogin(login.userId);
    } catch (d) {
      console.error("[invite] could not remove the new login:", errorMessage(d));
    }
    return { error: REFUSALS.inviteInvalid };
  }

  const supabase = await createSSRServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: invitation.email, password: parsed.data.password });

  if (!accepted.asOwner) {
    // notifySignedUp catches its own failures; this guard keeps the sign-up safe regardless.
    try {
      await notifySignedUp({ orgId: accepted.orgId, orgName: invitation.orgName, userId: login.userId, name: parsed.data.name, invitedBy: accepted.invitedBy });
    } catch (e) {
      console.error("[invite] could not send the signed-up notice:", errorMessage(e));
    }
  }
  // A member lands on the onboarding screen (they wait for access, whoever invited them); the
  // owner on an empty client list.
  redirect(error ? "/login" : "/");
}
