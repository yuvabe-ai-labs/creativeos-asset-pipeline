import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listPlansNeedingAttention, listRecentPayments, sumPaidSince } from "@/lib/db/billing-admin-payments";
import { usageRange } from "@/lib/billing/usage-period";
import { formatRupees } from "@/lib/billing/pricing";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments · Admin" };

const WHAT = { plan: "Plan", renewal: "Renewal", topup: "Top-up", test: "Test" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Admin › Payments (spec 2026-11-21-admin-payments-design.md, D525): what agencies paid, what needs
// attention, and every payment. Three reads in parallel.
export default async function AdminPaymentsPage() {
  await requireSuperAdmin();
  const [paid, attention, payments] = await Promise.all([sumPaidSince(usageRange("this_month").from), listPlansNeedingAttention(7), listRecentPayments(50)]);
  const due = attention.filter((a) => a.status === "payment_due");
  const renewing = attention.filter((a) => a.status !== "payment_due");
  const failed = payments.filter((p) => p.status === "failed").length;

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
          <Stat label="Renewing in 7 days" value={String(renewing.length)} note={failed ? `${failed} failed recently` : "No recent failures"} />
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
                    {a.status === "payment_due" ? <Badge variant="destructive">Payment due</Badge> : a.status === "cancelling" ? <Badge variant="outline">Ends</Badge> : <Badge variant="outline">Renews</Badge>}
                    {a.periodEnd ? day(a.periodEnd) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-eyebrow text-muted-foreground">Latest payments</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="flex flex-col">
                    <Link href={`/admin/orgs/${p.orgId}?tab=billing`} className="text-sm font-medium hover:underline">{p.orgName}</Link>
                    <span className="text-xs text-muted-foreground">
                      {WHAT[p.kind]}
                      {p.name ? ` · ${p.name}` : ""} · {day(p.at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    {p.status === "failed" && <Badge variant="destructive">Failed</Badge>}
                    {p.status === "refunded" && <Badge variant="outline">Refunded</Badge>}
                    {formatRupees(p.totalMinor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
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
