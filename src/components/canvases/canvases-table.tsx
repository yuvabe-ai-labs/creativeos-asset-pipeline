"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { CanvasRow } from "@/lib/db/types";

export function CanvasesTable({
  canvases,
  clientSlug,
}: {
  canvases: CanvasRow[];
  clientSlug: string;
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
        <div className="text-eyebrow flex items-center gap-4 border-b px-4 py-2.5 text-muted-foreground">
          <span className="flex-[3]">Canvas</span>
          <span className="flex-[2]">Last edited</span>
          <span className="flex-1 text-right">Created</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No canvases match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((canvas) => (
              <li key={canvas.id} className="border-b last:border-b-0">
                <Link
                  href={`/clients/${clientSlug}/canvases/${canvas.slug}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="flex-[3] font-medium">{canvas.name}</span>
                  <span className="flex-[2] text-sm text-muted-foreground">
                    {formatRelativeTime(canvas.updated_at)}
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2 text-sm text-muted-foreground">
                    {new Date(canvas.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
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
