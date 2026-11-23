import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { countRenewingWithin, listPlansNeedingAttention, listRecentPayments, sumPaidSince } from "@/lib/db/billing-admin-payments";
import { usageRange } from "@/lib/billing/usage-period";
import { formatRupees } from "@/lib/billing/pricing";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminPaymentsList } from "@/components/admin/payments/admin-payments-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments · Admin" };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Admin › Payments (spec 2026-11-21-admin-payments-design.md, D525): what agencies paid, what needs
// attention, and every payment, a page at a time (D529). Four reads in parallel, each bounded.
export default async function AdminPaymentsPage() {
  await requireSuperAdmin();
  const [paid, attention, renewing, payments] = await Promise.all([
    sumPaidSince(usageRange("this_month").from),
    listPlansNeedingAttention(7),
    countRenewingWithin(7),
    listRecentPayments(1),
  ]);
  const due = attention.filter((a) => a.status === "payment_due");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <AdminSectionNav />
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">What agencies paid, and what needs a look. Amounts include GST.</p>
      </div>

      <div className="flex flex-col gap-10">
        <Card className="grid grid-cols-1 gap-6 p-6 shadow-card sm:grid-cols-3">
          <Stat label="Paid this month" value={formatRupees(paid.totalMinor)} note={paid.count === 1 ? "1 payment" : `${paid.count} payments`} />
          <Stat label="Payments due" value={String(due.length)} note={due.length ? "AI runs are paused for these" : "None"} warn={due.length > 0} />
          <Stat label="Renewing in 7 days" value={renewing.toLocaleString("en-IN")} note={renewing ? "Renew on their own" : "None this week"} />
        </Card>

        {attention.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-eyebrow text-muted-foreground">Needs a look</h2>
            <ul className="flex flex-col divide-y divide-border">
              {attention.map((a) => (
                <li key={a.orgId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="flex flex-col">
                    <Link href={`/admin/orgs/${a.orgId}?tab=billing`} className="text-sm font-medium hover:underline">{a.orgName}</Link>
                    <span className="text-xs text-muted-foreground">{a.planName ?? "Plan"}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {a.status === "payment_due" ? <Badge variant="destructive">Payment due</Badge> : <Badge variant="outline">Ends</Badge>}
                    {a.periodEnd ? day(a.periodEnd) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <AdminPaymentsList initial={payments} />
      </div>
    </main>
  );
}

function Stat({ label, value, note, warn }: { label: string; value: string; note: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-eyebrow text-muted-foreground/80">{label}</span>
      <span className={warn ? "font-display text-2xl font-semibold tracking-tight text-destructive" : "font-display text-2xl font-semibold tracking-tight"}>{value}</span>
      <span className="text-xs text-muted-foreground/70">{note}</span>
    </div>
  );
}
