"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "@/hooks/use-identity";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type CreditTransactionRow = { amount: number };

/**
 * Live "used this month" figure next to the agency name. Hydrates from useIdentity()'s
 * cached /api/me fetch, then stays current via a Realtime subscription on new
 * credit_transactions rows — RLS (migration 0019's "org isolation" policy) already scopes
 * the subscription to the caller's own org, so no explicit org_id filter is needed here.
 * Incrementing locally by each new row's `amount` avoids a refetch round-trip per event;
 * org_credit_usage is itself defined as a plain sum (design spec §3), so this stays exactly
 * correct within a UTC month. A tab left open across the UTC month rollover can read stale
 * until the next full page load — accepted, not engineered around (see plan's Global
 * Constraints).
 */
export function HeaderCredits() {
  const { hydrated, creditsUsed, monthlyCreditLimit } = useIdentity();
  const [liveDelta, setLiveDelta] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel("header-credits")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "credit_transactions" },
        (payload: RealtimePostgresChangesPayload<CreditTransactionRow>) => {
          const row = payload.new as CreditTransactionRow;
          setLiveDelta((d) => d + row.amount);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hydrated]);

  if (!hydrated || creditsUsed === null) return null;
  const used = creditsUsed + liveDelta;

  return (
    <span className="text-sm text-muted-foreground">
      {monthlyCreditLimit === null
        ? `${used.toLocaleString()} credits used`
        : `${used.toLocaleString()} / ${monthlyCreditLimit.toLocaleString()} credits`}
    </span>
  );
}
