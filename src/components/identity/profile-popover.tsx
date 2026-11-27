"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, LogOut, UserRound } from "lucide-react";
import { useIdentity } from "@/hooks/use-identity";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateMe } from "@/hooks/queries/me";
import { logoutAction } from "@/lib/actions/auth";
import { initials } from "@/lib/format/initials";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileCredits } from "./profile-credits";
import { setViewerOwnsAgency } from "@/lib/billing/refusal-copy";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type CreditTransactionRow = { amount: number };

// Replaces IdentityChip's always-visible name pill + adjacent sign-out button, and the
// header's standalone credits pill (HeaderCredits) — name, credits, the workspace with Owner or
// Member, and sign out all live in one avatar-triggered popover now. See
// docs/superpowers/specs/2026-08-09-profile-popover-header-design.md.
export function ProfilePopover() {
  const { hydrated, identity, orgId, orgName, isOwner, creditsUsed, monthlyCreditLimit, billing } =
    useIdentity();
  // Null without view_credits: the server sends no figures to anyone but the owner, and nothing
  // listens for them.
  const showCredits = creditsUsed !== null;
  // A refused run's message depends on who is viewing (D582); the 402 handlers read this.
  useEffect(() => setViewerOwnsAgency(isOwner === true), [isOwner]);
  const queryClient = useQueryClient();
  // Runs counted live since the figures from /api/me were read. Fresh figures already include
  // them, so the count starts again whenever the figures change (adjusted during render, React's
  // pattern for state derived from props) and a refetch never counts a run twice.
  const figures = `${creditsUsed}|${billing && "left" in billing ? `${billing.left}|${billing.state}` : ""}`;
  const [live, setLive] = useState({ figures, delta: 0 });
  if (live.figures !== figures) setLive({ figures, delta: 0 });
  const liveDelta = live.figures === figures ? live.delta : 0;
  const setLiveDelta = (add: (d: number) => number) => setLive((l) => ({ figures: l.figures, delta: add(l.delta) }));

  // This subscription lives HERE, in the always-mounted popover shell, and NOT in
  // ProfileCredits where it started — that placement is the whole fix. HeaderActions mounts
  // this component on every page, but everything inside <PopoverContent> is unmounted while
  // the popover is closed (Base UI's Popover.Portal defaults to keepMounted: false). Credits
  // are spent while it's closed, so owning the channel down there meant nothing was
  // listening at the only moment that mattered, and `liveDelta` was thrown away on every
  // close — the figure sat at its page-load value until a manual refresh. Keep it mounted at
  // this level; ProfileCredits renders what it's handed.
  useEffect(() => {
    if (!hydrated || !orgId || !showCredits) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createBrowserSupabase();
    const refreshSoon = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void invalidateMe(queryClient), 800);
    };

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
        // D586: new credits (a top-up, a plan payment, free credits) and plan changes (paid,
        // payment due, cancelled) re-read /api/me, which the popover, the workspace bar and the
        // Billing link all show. Only grant INSERTs: every run UPDATEs its grant's used total,
        // and refetching per run is what the performance rules forbid. Bursts (a charge writes a
        // payment, a grant and a plan update together) collapse into one refetch.
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "credit_grants", filter: `org_id=eq.${orgId}` }, refreshSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "billing_subscriptions", filter: `org_id=eq.${orgId}` }, refreshSoon)
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [hydrated, orgId, showCredits, queryClient]);

  // Incrementing locally by each row's `amount` avoids a refetch per event. Settlement
  // writes two rows (refund of the reservation, then actual consumption), and
  // org_credit_usage is itself a plain sum (design spec §3), so summing every row stays
  // exactly correct within a UTC month. A tab left open across the UTC month rollover reads
  // stale until the next full page load — accepted, not engineered around.
  const used = creditsUsed === null ? null : creditsUsed + liveDelta;

  // A Server Action's redirect() is a soft, client-side transition, so every client cache would
  // survive sign-out. Clearing the query cache drops this person's identity and access at once
  // (it replaces resetIdentityCache()); the hard navigation below then starts every module-level
  // cache in the app clean for the next sign-in.
  async function handleSignOut(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    queryClient.clear();
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
              </div>
            </div>
            <div className="h-px bg-border" aria-hidden="true" />
          </>
        )}
        {used !== null && (
          <>
            <ProfileCredits
              used={used}
              monthlyCreditLimit={monthlyCreditLimit}
              // A paying agency sees credits left (D582); runs since the page loaded come off live.
              paying={billing && "state" in billing && billing.mode === "plans" ? { left: billing.left - liveDelta, total: billing.total } : undefined}
            />
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
          <div className="flex flex-col">
            <span className="text-base font-medium text-foreground">{orgName ?? "Your agency"}</span>
            {isOwner !== null && (
              <span className="text-sm text-muted-foreground">{isOwner ? "Owner" : "Member"}</span>
            )}
          </div>
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
