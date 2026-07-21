"use client";

import { UserRound } from "lucide-react";
import { useIdentity } from "@/hooks/use-identity";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

// Shows the logged-in user's display name + a sign-out button.
export function IdentityChip() {
  const { identity } = useIdentity();
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
        <UserRound className="size-3.5" strokeWidth={1.5} />
        {identity ? identity.name : "…"}
      </span>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
