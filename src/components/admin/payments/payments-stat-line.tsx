import { formatRupees } from "@/lib/billing/pricing";

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

function Figure({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <span>
      <span className="font-display text-[1.0625rem] font-semibold text-foreground tabular-nums">{value}</span> {children}
    </span>
  );
}

/** This month in one line (D592): paid, what plans bring each month, renewals this week, failed and
 *  refunded. Amounts include GST. */
export function PaymentsStatLine({
  paidMinor,
  paidCount,
  plansMonthlyMinor,
  renewing,
  failed,
  refundedMinor,
}: {
  paidMinor: number;
  paidCount: number;
  plansMonthlyMinor: number;
  renewing: number;
  failed: number;
  refundedMinor: number;
}) {
  return (
    <p className="mb-5 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
      <Figure value={formatRupees(paidMinor)}>paid this month, {count(paidCount, "payment", "payments")}</Figure>
      <Figure value={formatRupees(plansMonthlyMinor)}>a month from plans</Figure>
      <span>{count(renewing, "plan renews", "plans renew")} in 7 days</span>
      <span>
        {count(failed, "failed payment", "failed payments")} · {formatRupees(refundedMinor)} refunded
      </span>
    </p>
  );
}
