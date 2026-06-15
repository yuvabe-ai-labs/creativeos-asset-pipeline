"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { RecentCanvas } from "@/lib/db/recent-canvas";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function RecentCanvasesTable({
  canvases,
}: {
  canvases: RecentCanvas[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const rows = useMemo(
    () =>
      filterAndSort(canvases, query, sort, {
        name: (c) => c.name,
        timestamp: (c) => c.updated_at,
      }),
    [canvases, query, sort],
  );

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        placeholder="Search canvases…"
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-[3]">Canvas</span>
          <span className="flex-[2]">Client</span>
          <span className="flex-1 text-right">Last edited</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No canvases match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((canvas) => (
              <li key={canvas.id} className="border-b last:border-b-0">
                <Link
                  href={`/clients/${canvas.client_slug}/canvases/${canvas.slug}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="flex-[3] font-medium">{canvas.name}</span>
                  <span className="flex flex-[2] items-center gap-2.5 text-sm text-muted-foreground">
                    {canvas.client_logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={canvas.client_logo_url}
                        alt=""
                        className="size-7 shrink-0 rounded-md border bg-card object-contain p-0.5"
                      />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-[0.6rem] font-semibold text-muted-foreground/50">
                        {initials(canvas.client_name)}
                      </span>
                    )}
                    {canvas.client_name}
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2 text-sm text-muted-foreground">
                    {formatRelativeTime(canvas.updated_at)}
                    <ChevronRight
                      className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
