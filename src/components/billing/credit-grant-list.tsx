import type { ReactNode } from "react";
import { formatDay, lastDayOf } from "@/lib/billing/dates";
import type { GrantKind, OpenGrant } from "@/lib/billing/grants";

export const GRANT_KIND_LABEL: Record<GrantKind, string> = {
  free: "Free credits",
  plan: "Plan",
  topup: "Top-up",
  admin: "Added by Yuvabe",
};

const n = (v: number) => v.toLocaleString("en-IN");

// An agency's open credits, the one ending first at the top: the same list on the owner's billing
// page and in Admin, where `actions` adds Take back and Change end date to each row (D523).
// A grant whose credits were all taken back (0 of 0) is left out: nothing to show or act on, and the
// billing log keeps the record.
export function CreditGrantList({ grants, actions, empty }: { grants: OpenGrant[]; actions?: (g: OpenGrant) => ReactNode; empty: string }) {
  const shown = grants.filter((g) => g.credits > 0);
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {shown.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{GRANT_KIND_LABEL[g.kind]}</span>
                <span className="text-xs text-muted-foreground">until {formatDay(lastDayOf(g.endsAt))}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${g.credits > 0 ? Math.min(100, (g.left / g.credits) * 100) : 0}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">
                {n(g.left)} of {n(g.credits)} left
              </span>
            </div>
            {actions && <div className="flex gap-1">{actions(g)}</div>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Credits that end first are used first.</p>
    </>
  );
}
