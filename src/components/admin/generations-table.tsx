"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GenerationStatusBadge } from "@/components/admin/generation-status-badge";
import { cn } from "@/lib/utils";
import type { SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type {
  GenerationsPage,
  GenerationForOrgList,
  GenerationsPageSize,
} from "@/lib/db/generations";

const PAGE_SIZES: GenerationsPageSize[] = [10, 20, 30, 40, 50];

export function GenerationsTable({
  orgId,
  initial,
}: {
  orgId: string;
  initial: GenerationsPage;
}) {
  const everHadGenerations = initial.total > 0;

  const [rows, setRows] = useState<GenerationForOrgList[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<GenerationsPageSize>(20);
  const [loading, setLoading] = useState(false);

  // The initial page (page 1, default filters) was already fetched server-side — skip the
  // first effect pass so mount doesn't immediately re-fetch what we already have.
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const controller = new AbortController();
    // 300ms debounce — same pattern as the image-gen focus view's pre-generation cost
    // estimate (src/components/nodes/image-gen-focus-view.tsx).
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          sort,
        });
        if (query.trim()) params.set("query", query.trim());
        const res = await fetch(`/api/admin/orgs/${orgId}/generations?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as GenerationsPage;
        setRows(data.rows);
        setTotal(data.total);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [orgId, page, pageSize, query, sort]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount);

  function handleQueryChange(next: string) {
    setQuery(next);
    setPage(1);
  }
  function handleSortChange(next: SortKey) {
    setSort(next);
    setPage(1);
  }
  function handlePageSizeChange(next: string | null) {
    if (!next) return;
    setPageSize(Number(next) as GenerationsPageSize);
    setPage(1);
  }

  if (!everHadGenerations) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-14 text-center">
        <p className="font-display text-lg font-medium">No generations yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Generations created for this org&apos;s clients will show up here.
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

      <div
        className={cn(
          "flex max-h-[60vh] flex-col overflow-hidden rounded-xl border bg-card shadow-card transition-opacity duration-200",
          loading && "opacity-60",
        )}
      >
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-2.5 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-1">Type</span>
          <span className="flex-1">Status</span>
          <span className="flex-[2]">Model</span>
          <span className="flex-1">Estimated</span>
          <span className="flex-1">Deducted</span>
          <span className="flex-1 text-right">Created</span>
        </div>

        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No generations match “{query}”.
            </p>
          ) : (
            <ul>
              {rows.map((g) => (
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
                  <span className="flex-1 text-sm text-muted-foreground">
                    {g.estimated_credits === null ? "—" : g.estimated_credits.toLocaleString()}
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {g.status === "running"
                      ? "Pending…"
                      : g.credits_charged === null
                        ? "—"
                        : g.credits_charged.toLocaleString()}
                  </span>
                  <span className="flex-1 text-right text-sm text-muted-foreground">
                    {formatRelativeTime(g.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-card px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger size="sm" className="w-[68px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Page {clampedPage} of {pageCount}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={clampedPage <= 1}
                onClick={() => setPage(clampedPage - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft strokeWidth={1.5} />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={clampedPage >= pageCount}
                onClick={() => setPage(clampedPage + 1)}
                aria-label="Next page"
              >
                <ChevronRight strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
