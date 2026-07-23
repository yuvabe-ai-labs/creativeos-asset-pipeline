"use client";

import { useMemo, useState } from "react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { Card } from "@/components/ui/card";
import { GenerationStatusBadge } from "@/components/admin/generation-status-badge";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { USD_TO_INR } from "@/lib/pricing";
import type { GenerationForOrgList } from "@/lib/db/generations";

const PAGE_SIZE = 25;

export function GenerationsTable({
  generations,
}: {
  generations: GenerationForOrgList[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);

  const rows = useMemo(
    () =>
      filterAndSort(generations, query, sort, {
        name: (g) => g.model_used ?? "",
        timestamp: (g) => g.created_at,
      }),
    [generations, query, sort],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = rows.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function handleQueryChange(next: string) {
    setQuery(next);
    setPage(1);
  }
  function handleSortChange(next: SortKey) {
    setSort(next);
    setPage(1);
  }

  if (generations.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
        <p className="font-display text-lg font-medium">No generations yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Generations created for this org's clients will show up here.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={handleQueryChange}
        sort={sort}
        onSortChange={handleSortChange}
        placeholder="Search by model…"
      />

      <div className="flex max-h-[60vh] flex-col overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-2.5 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-1">Type</span>
          <span className="flex-1">Status</span>
          <span className="flex-[2]">Model</span>
          <span className="flex-[2]">Client</span>
          <span className="flex-1">Credits</span>
          <span className="flex-1 text-right">Created</span>
        </div>

        <div className="overflow-y-auto">
          {pageRows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No generations match “{query}”.
            </p>
          ) : (
            <ul>
              {pageRows.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                >
                  <span className="flex-1 text-sm capitalize">{g.type}</span>
                  <span className="flex-1">
                    <GenerationStatusBadge status={g.status} />
                  </span>
                  <span className="flex-[2] truncate text-sm text-muted-foreground">
                    {g.model_used ?? "—"}
                  </span>
                  <span
                    className="flex-[2] truncate text-sm text-muted-foreground"
                    title={g.client_name ?? undefined}
                  >
                    {g.client_name ?? "—"}
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {g.credits_consumed === null
                      ? "—"
                      : `₹${(g.credits_consumed * USD_TO_INR).toFixed(2)}`}
                  </span>
                  <span className="flex-1 text-right text-sm text-muted-foreground">
                    {formatRelativeTime(g.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Pagination
          page={clampedPage}
          pageCount={pageCount}
          onPageChange={setPage}
          className="border-t bg-card"
        />
      </div>
    </div>
  );
}
