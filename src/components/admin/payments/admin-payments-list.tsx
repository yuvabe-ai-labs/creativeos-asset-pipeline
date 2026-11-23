"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatRupees } from "@/lib/billing/pricing";
import { ADMIN_PAYMENTS_PAGE_SIZE, pageCount } from "@/lib/billing/usage-page-size";
import type { AdminPaymentsPage } from "@/lib/db/billing-admin-payments";
import { useAdminPaymentsPage } from "@/hooks/queries/billing-history";
import { HistoryPager } from "@/components/billing/history-pager";

const WHAT = { plan: "Plan", renewal: "Renewal", topup: "Top-up", test: "Test" } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Admin › Payments: every payment across agencies, newest first, 25 at a time (D525, D529). Page 1
// comes with the page; older pages load on demand.
export function AdminPaymentsList({ initial }: { initial: AdminPaymentsPage }) {
  const [page, setPage] = useState(1);
  const older = useAdminPaymentsPage(page);
  const shown = page === 1 ? initial : older.data ?? initial;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-eyebrow text-muted-foreground">All payments</h2>
        {shown.total > ADMIN_PAYMENTS_PAGE_SIZE && <span className="text-xs text-muted-foreground">{shown.total.toLocaleString("en-IN")} payments</span>}
      </div>
      {shown.total === 0 ? (
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <>
          <ul className={older.isFetching ? "flex flex-col divide-y divide-border opacity-60 transition-opacity" : "flex flex-col divide-y divide-border"}>
            {shown.payments.map((p) => (
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
          {older.isError && page > 1 && <p className="text-xs text-muted-foreground">That page couldn&apos;t be loaded. Try again.</p>}
          <HistoryPager page={page} pages={pageCount(shown.total, ADMIN_PAYMENTS_PAGE_SIZE)} busy={older.isFetching} onChange={setPage} />
        </>
      )}
    </section>
  );
}
