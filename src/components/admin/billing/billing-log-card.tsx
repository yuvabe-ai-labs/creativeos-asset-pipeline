"use client";

import { useState } from "react";
import { describeBillingChange } from "@/lib/billing/log-text";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { BILLING_LOG_PAGE_SIZE, pageCount } from "@/lib/billing/usage-page-size";
import type { BillingLogPage } from "@/lib/db/billing-admin";
import { useBillingLogPage } from "@/hooks/queries/billing-history";
import { HistoryPager } from "@/components/billing/history-pager";

// Every billing change Yuvabe made to this agency (spec §4), newest first, ten at a time (D588).
// Page 1 comes with the admin page; older pages load on demand.
export function BillingLog({ orgId, initial }: { orgId: string; initial: BillingLogPage }) {
  const [page, setPage] = useState(1);
  const older = useBillingLogPage(orgId, page);
  const shown = page === 1 ? initial : older.data ?? initial;
  const pages = pageCount(shown.total, BILLING_LOG_PAGE_SIZE);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-eyebrow text-muted-foreground">Billing log</h2>
        {shown.total > BILLING_LOG_PAGE_SIZE && (
          <span className="text-xs text-muted-foreground">{shown.total.toLocaleString("en-IN")} changes</span>
        )}
      </div>
      {shown.total === 0 ? (
        <p className="text-sm text-muted-foreground">No billing changes yet.</p>
      ) : (
        <>
          <ul className={older.isFetching ? "flex flex-col divide-y divide-border opacity-60 transition-opacity" : "flex flex-col divide-y divide-border"}>
            {shown.entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 py-3">
                <span className="text-sm">{describeBillingChange(e)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(e.createdAt)} · {e.actorName ?? "Yuvabe"}{e.reason ? ` · ${e.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {older.isError && page > 1 && <p className="text-xs text-muted-foreground">That page couldn&apos;t be loaded. Try again.</p>}
          <HistoryPager page={page} pages={pages} busy={older.isFetching} onChange={setPage} />
        </>
      )}
    </section>
  );
}
