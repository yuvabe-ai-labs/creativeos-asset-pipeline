"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, LogOut, UserRound } from "lucide-react";
import { useIdentity, resetIdentityCache } from "@/hooks/use-identity";
import { logoutAction } from "@/lib/actions/auth";
import { initials } from "@/lib/format/initials";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileCredits } from "./profile-credits";
import type { OrgRole } from "@/lib/dal-logic";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type CreditTransactionRow = { amount: number };

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
  const { hydrated, identity, orgId, orgName, orgRole, creditsUsed, monthlyCreditLimit } =
    useIdentity();
  const [liveDelta, setLiveDelta] = useState(0);

  // This subscription lives HERE, in the always-mounted popover shell, and NOT in
  // ProfileCredits where it started — that placement is the whole fix. HeaderActions mounts
  // this component on every page, but everything inside <PopoverContent> is unmounted while
  // the popover is closed (Base UI's Popover.Portal defaults to keepMounted: false). Credits
  // are spent while it's closed, so owning the channel down there meant nothing was
  // listening at the only moment that mattered, and `liveDelta` was thrown away on every
  // close — the figure sat at its page-load value until a manual refresh. Keep it mounted at
  // this level; ProfileCredits renders what it's handed.
  useEffect(() => {
    if (!hydrated || !orgId) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const supabase = createBrowserSupabase();

    // @supabase/ssr's browser client doesn't proactively load the session on init — it's
    // lazy until something calls getSession()/getUser(). Subscribing to Realtime before
    // that resolves opens the websocket with NO JWT attached, so credit_transactions' RLS
    // policy (org_id = ...auth.uid()...) evaluates auth.uid() as null and silently drops
    // every row — the subscription looks "connected" but never delivers anything. Awaiting
    // the session first guarantees the websocket carries a valid JWT before it subscribes.
    //
    // The EXPLICIT org_id filter is also load-bearing: an RLS-only subscription (relying
    // purely on the "org isolation" select policy, migration 0019) didn't reliably deliver
    // events in practice.
    void supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`profile-credits:${orgId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "credit_transactions",
            filter: `org_id=eq.${orgId}`,
          },
          (payload: RealtimePostgresChangesPayload<CreditTransactionRow>) => {
            const row = payload.new as CreditTransactionRow;
            setLiveDelta((d) => d + row.amount);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [hydrated, orgId]);

  // Incrementing locally by each row's `amount` avoids a refetch per event. Settlement
  // writes two rows (refund of the reservation, then actual consumption), and
  // org_credit_usage is itself a plain sum (design spec §3), so summing every row stays
  // exactly correct within a UTC month. A tab left open across the UTC month rollover reads
  // stale until the next full page load — accepted, not engineered around.
  const used = creditsUsed === null ? null : creditsUsed + liveDelta;

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
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Account menu"
            className="size-9 rounded-full bg-primary/10 text-sm font-medium text-primary transition-all duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:bg-primary/10 hover:text-primary aria-expanded:bg-primary/10 aria-expanded:text-primary hover:ring-1 hover:ring-primary/40 dark:hover:bg-primary/10"
          >
            {identity ? (
              initials(identity.name)
            ) : (
              <UserRound className="size-4" strokeWidth={1.5} />
            )}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-72 gap-0 overflow-hidden rounded-xl p-0"
      >
        {identity && (
          <>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {initials(identity.name)}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-semibold text-foreground">
                  {identity.name}
                </span>
                {orgRole && (
                  <span className="text-sm text-muted-foreground">{ROLE_LABELS[orgRole]}</span>
                )}
              </div>
            </div>
            <div className="h-px bg-border" aria-hidden="true" />
          </>
        )}
        {used !== null && (
          <>
            <ProfileCredits used={used} monthlyCreditLimit={monthlyCreditLimit} />
            <div className="h-px bg-border" aria-hidden="true" />
          </>
        )}
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow" style={{ letterSpacing: "0.1em" }}>
              Workspace
            </span>
          </div>
          <span className="text-base font-medium text-foreground">{orgName ?? "—"}</span>
        </div>
        <div className="h-px bg-border" aria-hidden="true" />
        <form onSubmit={handleSignOut}>
          <Button
            type="submit"
            variant="ghost"
            className="h-auto w-full justify-start gap-2 rounded-none px-4 py-3.5 text-base font-medium text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            <LogOut className="size-4" strokeWidth={1.5} />
            Sign Out
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
