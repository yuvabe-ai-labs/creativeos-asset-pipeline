import { Badge } from "@/components/ui/badge";
import type { OwnerPayment } from "@/lib/db/billing-owner";
import { formatRupees } from "@/lib/billing/pricing";

const WHAT: Record<OwnerPayment["kind"], string> = { plan: "Plan", renewal: "Monthly renewal", topup: "Top-up", test: "Test payment" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// The agency's payments on Billing, newest first (D523): what, when, the total with GST.
export function PaymentsList({ payments }: { payments: OwnerPayment[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-eyebrow text-muted-foreground">Payments</h2>
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col">
                <span className="text-sm">
                  {WHAT[p.kind]}
                  {p.name ? ` · ${p.name}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {day(p.paidAt ?? p.createdAt)} · {p.credits.toLocaleString("en-IN")} credits
                </span>
              </div>
              <span className="flex items-center gap-2 text-sm">
                {p.status === "failed" && <Badge variant="destructive">Failed</Badge>}
                {p.status === "refunded" && <Badge variant="outline">Refunded</Badge>}
                {formatRupees(p.totalMinor ?? p.amountMinor)}
                {p.taxMinor > 0 && <span className="text-xs text-muted-foreground">incl. GST</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
