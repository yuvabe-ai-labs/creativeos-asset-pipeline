import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { countRenewingWithin, listAdminPaymentsPage, listPlansNeedingAttention } from "@/lib/db/billing-admin-payments";
import { getOfferHealth } from "@/lib/db/billing-catalog";
import { DEFAULT_PAYMENT_FILTERS } from "@/lib/billing/admin-payments-filters";
import { usageRange } from "@/lib/billing/usage-period";
import { withGst } from "@/lib/billing/gst";
import { paymentAttentionItems } from "@/lib/admin/payments-page";
import { NeedsALookCard } from "@/components/admin/models/needs-a-look-card";
import { PaymentsLedger } from "@/components/admin/payments/payments-ledger";
import { PaymentsStatLine } from "@/components/admin/payments/payments-stat-line";
import { adminPageClass } from "@/components/admin/admin-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments — Admin" };

// Admin › Payments, needs a look then the ledger (D592). One round of parallel reads, each bounded
// or grouped in the database: plans that need a person, renewals this week, what plans bring each
// month, and the ledger's first page with this month's totals by status (which the line above it
// reuses, as the ledger opens on this month).
export default async function AdminPaymentsPage() {
  await requireSuperAdmin();
  const now = new Date();
  const [attention, renewing, health, ledger] = await Promise.all([
    listPlansNeedingAttention(7),
    countRenewingWithin(7),
    getOfferHealth(usageRange("this_month", now).from),
    listAdminPaymentsPage(DEFAULT_PAYMENT_FILTERS),
  ]);
  const monthly = Object.values(health).reduce((n, h) => n + h.monthlyMinor, 0);
  const { counts, amounts } = ledger.totals;

  return (
    <main className={adminPageClass()}>
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">What agencies paid, and what needs a look. Amounts include GST.</p>
      </div>
      <NeedsALookCard items={paymentAttentionItems(attention, now)} />
      <PaymentsStatLine
        paidMinor={amounts.paid}
        paidCount={counts.paid}
        plansMonthlyMinor={withGst(monthly)}
        renewing={renewing}
        failed={counts.failed}
        refundedMinor={amounts.refunded}
      />
      <PaymentsLedger initial={ledger} />
    </main>
  );
}
