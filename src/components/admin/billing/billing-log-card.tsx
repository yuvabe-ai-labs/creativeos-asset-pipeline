import { describeBillingChange } from "@/lib/billing/log-text";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { BillingLogEntry } from "@/lib/db/billing-admin";

// The last 50 billing changes Yuvabe made to this agency (spec §4).
export function BillingLog({ entries }: { entries: BillingLogEntry[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-eyebrow text-muted-foreground">Billing log</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No billing changes yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 py-3">
              <span className="text-sm">{describeBillingChange(e)}</span>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(e.createdAt)} · {e.actorName ?? "Yuvabe"}{e.reason ? ` · ${e.reason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
