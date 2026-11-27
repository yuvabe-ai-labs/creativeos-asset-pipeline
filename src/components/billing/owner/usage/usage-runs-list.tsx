"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsageRuns } from "@/hooks/queries/billing-usage";
import { USAGE_RUNS_PAGE_SIZE, pageCount } from "@/lib/billing/usage-page-size";
import { runTypeLabel } from "@/lib/billing/usage-kinds";
import type { UsageBy, UsagePeriod } from "@/lib/billing/usage-period";
import type { UsageRun } from "@/lib/db/billing-usage";
import { HistoryPager } from "../../history-pager";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Who made the run and where, leaving out what the list is already grouped by. */
function context(r: UsageRun, by: UsageBy): string {
  const bits = [when(r.createdAt)];
  if (by !== "member") bits.push(r.memberName ?? "Someone no longer in the agency");
  if (by === "canvas") return bits.join(" · ");
  if (r.canvasName) bits.push(by === "client" || !r.clientName ? r.canvasName : `${r.canvasName}, ${r.clientName}`);
  else bits.push(by === "client" || !r.clientName ? "Outside a canvas" : `Outside a canvas, ${r.clientName}`);
  return bits.join(" · ");
}

// One group's runs in the Usage page's side panel (D583, D597), newest first, a page at a time,
// each naming who made it and on which canvas of which client.
export function UsageRunsList({ by, rowKey, period }: { by: UsageBy; rowKey: string | null; period: UsagePeriod }) {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, isFetching, refetch } = useUsageRuns(by, rowKey, period, page, true);

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 py-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2 py-4 text-sm text-muted-foreground">
        The runs couldn&apos;t be loaded.
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button>
      </div>
    );
  }
  if (data.runs.length === 0) return <p className="py-4 text-sm text-muted-foreground">No runs to show.</p>;

  return (
    <div className="flex flex-col gap-2">
      <ul className={isFetching ? "flex flex-col divide-y divide-border opacity-60 transition-opacity" : "flex flex-col divide-y divide-border"}>
        {data.runs.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-3">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">
                {runTypeLabel(r.type)}
                {r.model ? <span className="text-muted-foreground"> · {r.model}</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">{context(r, by)}</span>
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums">{Math.round(r.credits).toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
      <HistoryPager page={page} pages={pageCount(data.total, USAGE_RUNS_PAGE_SIZE)} busy={isFetching} onChange={setPage} />
    </div>
  );
}
