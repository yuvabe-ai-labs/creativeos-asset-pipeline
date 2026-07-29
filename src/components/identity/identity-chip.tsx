"use client";

import type { FormEvent } from "react";
import { UserRound } from "lucide-react";
import { useIdentity, resetIdentityCache } from "@/hooks/use-identity";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

// Shows the logged-in user's display name + a sign-out button.
export function IdentityChip() {
  const { identity } = useIdentity();

  // A Server Action's redirect() is a soft, client-side transition — it would leave every
  // module-level client cache (useIdentity's included) intact across sign-out, which was
  // the root cause of a stale-identity-from-the-previous-account bug (sign out of org A,
  // sign in as org B in the same tab, header keeps showing org A until a manual refresh).
  // resetIdentityCache() closes that specific gap immediately; the hard window.location
  // navigation below is the actual fix — it forces a full reload, guaranteeing every
  // module-level cache in the app (not just identity's) starts clean for the next sign-in.
  async function handleSignOut(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    resetIdentityCache();
    await logoutAction();
    window.location.href = "/login";
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
        <UserRound className="size-3.5" strokeWidth={1.5} />
        {identity ? identity.name : "…"}
      </span>
      <form onSubmit={handleSignOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
