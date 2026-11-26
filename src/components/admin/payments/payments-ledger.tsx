"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgenciesState } from "@/components/admin/agencies/agencies-state";
import { AGENCY_WIDE } from "@/components/admin/agencies/agency-row";
import { HistoryPager } from "@/components/billing/history-pager";
import { useAdminPayments } from "@/hooks/queries/billing-history";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { DEFAULT_PAYMENT_FILTERS, PAYMENT_RANGE_LABEL, PAYMENT_TABS, isDefaultPaymentFilters, type PaymentFilters } from "@/lib/billing/admin-payments-filters";
import type { AdminPaymentsPage } from "@/lib/db/billing-admin-payments";
import { ADMIN_PAYMENTS_PAGE_SIZE, pageCount } from "@/lib/billing/usage-page-size";
import { formatRupees } from "@/lib/billing/pricing";
import { cn } from "@/lib/utils";
import { PaymentRow } from "./payment-row";
import { PaymentsToolbar } from "./payments-toolbar";

const TH = "h-10 border-b bg-muted px-3.5 text-left text-[0.8rem] font-medium whitespace-nowrap text-muted-foreground first:rounded-tl-xl last:rounded-tr-xl max-md:px-3";
const SUM_LABEL = { all: "paid", paid: "paid", failed: "failed", refunded: "refunded", created: "not finished" } as const;

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select, [role='textbox']") !== null);

// Admin › Payments' ledger (D592): every payment, searched by agency, for this month, last month or
// all time, with tabs by status, 25 a page (D588). The first view comes with the page; other
// filters read the same server function through the route. A failed read says so, never "none".
export function PaymentsLedger({ initial }: { initial: AdminPaymentsPage }) {
  const [input, setInput] = useState("");
  const [filters, setFilters] = useState<PaymentFilters>(DEFAULT_PAYMENT_FILTERS);
  const searchRef = useRef<HTMLInputElement>(null);
  const query = useAdminPayments(filters);
  const first = isDefaultPaymentFilters(filters);
  const failed = !first && query.isError;
  // Until a new filter's first answer arrives, the last one stays on screen, dimmed.
  const shown = first ? initial : (query.data ?? initial);

  const change = (next: Partial<PaymentFilters>) => setFilters((f) => ({ ...f, page: 1, ...next }));
  const search = useDebouncedCallback((q: string) => change({ query: q }), 250);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("[role='dialog']")) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function onQueryChange(q: string) {
    setInput(q);
    if (q === "") change({ query: "" });
    else search(q);
  }

  const q = filters.query.trim();
  const tabLabel = PAYMENT_TABS.find((t) => t.key === filters.tab)?.label.toLowerCase();
  const range = PAYMENT_RANGE_LABEL[filters.range].toLowerCase();
  const sum = filters.tab === "all" ? shown.totals.amounts.paid : shown.totals.amounts[filters.tab];

  return (
    <section aria-label="All payments">
      <PaymentsToolbar
        searchRef={searchRef}
        query={input}
        onQueryChange={onQueryChange}
        range={filters.range}
        onRangeChange={(r) => change({ range: r })}
        tab={filters.tab}
        onTabChange={(t) => change({ tab: t })}
        counts={failed ? null : shown.totals.counts}
      />
      <div className="rounded-xl border bg-card shadow-card">
        {failed ? (
          <AgenciesState
            title="Couldn't load payments"
            actions={
              <Button variant="outline" onClick={() => void query.refetch()}>
                <RefreshCw strokeWidth={1.5} />
                Try again
              </Button>
            }
          >
            Nothing has changed. Try again in a moment.
          </AgenciesState>
        ) : (
          <>
            <table className={cn("w-full border-separate border-spacing-0 transition-opacity duration-200", query.isFetching && "opacity-60")}>
              <thead>
                <tr>
                  <th className={TH}>Agency</th>
                  <th className={cn(TH, AGENCY_WIDE)}>When</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, "text-right")}>Amount, with GST</th>
                  <th className={cn(TH, AGENCY_WIDE, "w-px")}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.payments.length > 0 ? (
                  shown.payments.map((p) => <PaymentRow key={p.id} payment={p} />)
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <AgenciesState
                        title="No payments match"
                        actions={
                          <>
                            {q && <Button variant="outline" onClick={() => onQueryChange("")}>Clear search</Button>}
                            {filters.range !== "all" && <Button variant="outline" onClick={() => change({ range: "all" })}>Show all time</Button>}
                          </>
                        }
                      >
                        {q ? `Nothing for “${q}” in ${range}.` : `Nothing ${filters.tab === "all" ? "" : `${tabLabel} `}in ${range}.`}
                      </AgenciesState>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-[0.8rem] text-muted-foreground">
              <span aria-live="polite">
                {shown.total.toLocaleString("en-IN")} {shown.total === 1 ? "payment" : "payments"}
                {sum > 0 && ` · ${formatRupees(sum)} ${SUM_LABEL[filters.tab]}`}
              </span>
              <HistoryPager className="gap-3" page={filters.page} pages={pageCount(shown.total, ADMIN_PAYMENTS_PAGE_SIZE)} busy={query.isFetching} onChange={(page) => setFilters((f) => ({ ...f, page }))} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
