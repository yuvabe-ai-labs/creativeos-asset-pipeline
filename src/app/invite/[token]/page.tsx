import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getInvitationByToken } from "@/lib/db/people";
import { invitePageState } from "@/lib/invites/page-state";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { getUserWithRetry } from "@/lib/supabase/get-user-with-retry";
import { InviteSignUpForm } from "./invite-sign-up-form";

export const dynamic = "force-dynamic";
// no-referrer: the token is in this page's URL and must not travel to anything it links to.
export const metadata: Metadata = { title: "Join — CreativeOS", referrer: "no-referrer" };

// Spec §6.3. Outside the session proxy (src/proxy.ts): someone invited has no account yet.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([
    getInvitationByToken(token),
    createSSRServerClient().then(getUserWithRetry),
  ]);
  const state = invitePageState(invitation, user?.email ?? null);
  if (state.kind === "signed_in") redirect("/");

  return (
    <main className="login-surface flex flex-1 items-center justify-center p-6">
      <Card className="flex w-full max-w-md flex-col gap-6 p-8 shadow-card">
        {state.kind === "invalid" && (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">This invite link is no longer valid</h1>
            <p className="text-sm text-muted-foreground">It may have been used, cancelled or replaced, or it expired. Ask for a new one, or sign in if you have an account.</p>
            <Button nativeButton={false} render={<Link href="/login">Sign in</Link>} />
          </>
        )}
        {state.kind === "wrong_email" && (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Wrong account</h1>
            <p className="text-sm text-muted-foreground">This invite is for {state.email}. Sign in with that email to accept it.</p>
            <Button nativeButton={false} render={<Link href="/login">Sign in</Link>} />
          </>
        )}
        {state.kind === "sign_up" && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-eyebrow text-muted-foreground">
                {state.invitation.asOwner ? "Set up your agency" : `Invited by ${state.invitation.inviterName ?? state.invitation.orgName}`}
              </p>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {state.invitation.asOwner ? `Set up ${state.invitation.orgName} on CreativeOS` : `Join ${state.invitation.orgName}`}
              </h1>
              {state.invitation.clientName && <p className="text-sm text-muted-foreground">To work on {state.invitation.clientName}.</p>}
            </div>
            <InviteSignUpForm token={token} email={state.invitation.email} agency={state.invitation.orgName} />
          </>
        )}
      </Card>
    </main>
  );
}
