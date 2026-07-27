"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { useIdentity } from "@/hooks/use-identity";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type CreditTransactionRow = { amount: number };

/**
 * Live "used this month" figure next to the agency name. Hydrates from useIdentity()'s
 * cached /api/me fetch, then stays current via a Realtime subscription on new
 * credit_transactions rows. Uses an EXPLICIT `org_id` filter (not RLS alone) — an initial
 * RLS-only subscription (relying purely on the "org isolation" select policy, migration
 * 0019) didn't reliably deliver events in practice; an explicit filter matches the one other
 * working Realtime subscription in this codebase (use-video-gen-status.ts's `node_id=eq...`
 * filter) instead of a new, unproven filter-less pattern. Incrementing locally by each new
 * row's `amount` avoids a refetch round-trip per event; org_credit_usage is itself defined
 * as a plain sum (design spec §3), so this stays exactly correct within a UTC month. A tab
 * left open across the UTC month rollover can read stale until the next full page load —
 * accepted, not engineered around (see plan's Global Constraints).
 */
export function HeaderCredits() {
  const { hydrated, orgId, creditsUsed, monthlyCreditLimit } = useIdentity();
  const [liveDelta, setLiveDelta] = useState(0);

  useEffect(() => {
    if (!hydrated || !orgId) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`header-credits:${orgId}`)
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
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hydrated, orgId]);

  if (!hydrated || creditsUsed === null) return null;
  const used = creditsUsed + liveDelta;
  const over = monthlyCreditLimit !== null && used > monthlyCreditLimit;
  const fillPct =
    monthlyCreditLimit !== null && monthlyCreditLimit > 0
      ? Math.min(used / monthlyCreditLimit, 1) * 100
      : null;

  return (
    <div className="flex w-[200px] items-center gap-2.5 rounded-2xl border border-border bg-card py-2 pl-2.5 pr-3 ">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          over ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary",
        )}
      >
        <Zap className="size-3.5" strokeWidth={1.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-display text-lg leading-none font-semibold tracking-tight",
              over ? "text-amber-600 dark:text-amber-400" : "text-foreground",
            )}
          >
            {used.toLocaleString()}
          </span>
          {monthlyCreditLimit !== null && (
            <span className="text-xs leading-none text-muted-foreground">
              / {monthlyCreditLimit.toLocaleString()}
            </span>
          )}
        </div>
        {fillPct !== null && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                over ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${over ? 100 : fillPct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
