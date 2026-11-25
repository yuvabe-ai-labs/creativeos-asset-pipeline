"use client";

import { useState } from "react";
import { useUsageRuns } from "@/hooks/queries/billing-usage";
import { USAGE_RUNS_PAGE_SIZE, pageCount } from "@/lib/billing/usage-page-size";
import { HistoryPager } from "../history-pager";
import type { UsageBy, UsagePeriod } from "@/lib/billing/usage-period";

// generations.type (GenerationRow in src/lib/db/types.ts) in plain words.
const KIND: Record<string, string> = {
  image: "Image",
  video: "Video",
  prompt: "Writing",
  voice: "Voice",
  dub: "Dub",
  lipsync: "Lip sync",
  transcribe: "Captions",
  edit: "Edit",
};
const kind = (t: string) => KIND[t] ?? t.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// The runs inside one row of Who used what (D583), newest first, a page at a time.
export function UsageRuns({ by, rowKey, period }: { by: UsageBy; rowKey: string | null; period: UsagePeriod }) {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, isFetching } = useUsageRuns(by, rowKey, period, page, true);
  const pages = data ? pageCount(data.total, USAGE_RUNS_PAGE_SIZE) : 1;

  if (isPending) return <p className="px-5 pb-4 text-xs text-muted-foreground">Loading runs…</p>;
  if (isError) return <p className="px-5 pb-4 text-xs text-muted-foreground">The runs couldn&apos;t be loaded.</p>;

  return (
    <div className="flex flex-col gap-2 bg-muted/20 px-5 pt-1 pb-4">
      <ul className="flex flex-col divide-y divide-border/60">
        {data.runs.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-xs">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-foreground">
                {kind(r.type)}
                {r.model ? <span className="text-muted-foreground"> · {r.model}</span> : null}
              </span>
              <span className="text-muted-foreground">
                {when(r.createdAt)}
                {by !== "member" && r.memberName ? ` · ${r.memberName}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-sm">{Math.round(r.credits).toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
      <HistoryPager page={page} pages={pages} busy={isFetching} onChange={setPage} />
    </div>
  );
}
