"use client";

import type { FormEvent } from "react";
import { Building2, LogOut } from "lucide-react";
import { useIdentity, resetIdentityCache } from "@/hooks/use-identity";
import { logoutAction } from "@/lib/actions/auth";
import { initials } from "@/lib/format/initials";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileCredits } from "./profile-credits";
import type { OrgRole } from "@/lib/dal-logic";

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  senior: "Senior",
  designer: "Designer",
};

// Replaces IdentityChip's always-visible name pill + adjacent sign-out button, and the
// header's standalone credits pill (HeaderCredits) — name, real role, credits, workspace and
// sign out all live in one avatar-triggered popover now. See
// docs/superpowers/specs/2026-08-09-profile-popover-header-design.md.
export function ProfilePopover() {
  const { identity, hydrated, orgName, orgRole, creditsUsed } = useIdentity();

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

  if (!hydrated || !identity) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Account menu"
            className="rounded-full bg-primary/10 text-xs font-medium text-primary transition-all duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:bg-primary/10 hover:text-primary hover:ring-1 hover:ring-primary/40"
          >
            {initials(identity.name)}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-1">
        <div className="flex flex-col gap-0.5 px-2 py-1">
          <span className="text-sm font-medium text-foreground">{identity.name}</span>
          {orgRole && (
            <span className="text-xs text-muted-foreground">{ROLE_LABELS[orgRole]}</span>
          )}
        </div>
        {creditsUsed !== null && (
          <>
            <div className="h-px bg-border" aria-hidden="true" />
            <ProfileCredits />
          </>
        )}
        <div className="h-px bg-border" aria-hidden="true" />
        <div className="flex flex-col gap-1 px-2 py-1">
          <div className="flex items-center gap-1.5">
            <Building2 className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-eyebrow">Workspace</span>
          </div>
          <span className="text-sm font-medium text-foreground">{orgName ?? "—"}</span>
        </div>
        <div className="h-px bg-border" aria-hidden="true" />
        <form onSubmit={handleSignOut}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 px-2 text-destructive hover:text-destructive"
          >
            <LogOut className="size-3.5" strokeWidth={1.5} />
            Sign out
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
