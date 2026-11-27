"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { OwnerPayment, OwnerPaymentsPage } from "@/lib/db/billing-owner";
import { formatRupees } from "@/lib/billing/pricing";
import { OWNER_PAYMENTS_PAGE_SIZE, pageCount } from "@/lib/billing/usage-page-size";
import { useOwnerPaymentsPage } from "@/hooks/queries/billing-history";
import { HistoryPager } from "../history-pager";

const WHAT: Record<OwnerPayment["kind"], string> = { plan: "Plan", renewal: "Monthly renewal", topup: "Top-up", test: "Test payment" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// The agency's payments, newest first (D582), ten at a time (D588): what, when, the total with GST.
// Page 1 comes with the page; older pages load on demand, so no payment is ever cut off. `limit`
// shows only the newest few, with no pager (the Usage page's side column; See all opens the rest).
export function PaymentsList({ initial, limit }: { initial: OwnerPaymentsPage; limit?: number }) {
  const [page, setPage] = useState(1);
  const older = useOwnerPaymentsPage(page);
  const shown = page === 1 ? initial : older.data ?? initial;
  const rows = limit ? shown.payments.slice(0, limit) : shown.payments;

  return (
    <div className="flex flex-col gap-2">
      {shown.total === 0 ? (
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <>
          <ul className={older.isFetching ? "flex flex-col divide-y divide-border opacity-60 transition-opacity" : "flex flex-col divide-y divide-border"}>
            {rows.map((p) => (
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
          {older.isError && page > 1 && <p className="text-xs text-muted-foreground">That page couldn&apos;t be loaded. Try again.</p>}
          {!limit && <HistoryPager page={page} pages={pageCount(shown.total, OWNER_PAYMENTS_PAGE_SIZE)} busy={older.isFetching} onChange={setPage} />}
        </>
      )}
    </div>
  );
}
