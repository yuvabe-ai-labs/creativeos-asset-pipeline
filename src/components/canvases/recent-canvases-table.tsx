"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Microscope } from "lucide-react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Button } from "@/components/ui/button";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { initials } from "@/lib/format/initials";
import type { RecentCanvas } from "@/lib/db/recent-canvas";

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
        {/* Inner flex-1 track + a w-32 spacer mirroring the row-actions gutter, so
            "Last edited" ends exactly where its dates end rather than running on to
            the card edge past the Evals button. */}
        <div className="text-eyebrow flex items-center border-b bg-muted/40 py-3 text-[0.7rem] text-muted-foreground/80">
          <div className="flex min-w-0 flex-1 items-center gap-4 pl-5">
            <span className="min-w-0 flex-[3]">Canvas</span>
            <span className="min-w-0 flex-[2] text-right">Client</span>
            <span className="min-w-0 flex-1 text-right">Last edited</span>
          </div>
          <span className="w-32 shrink-0" aria-hidden />
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No canvases match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((canvas) => (
              <li
                key={canvas.id}
                className="group relative border-b transition-colors last:border-b-0 hover:bg-muted/40"
              >
                <Link
                  href={`/clients/${canvas.client_slug}/canvases/${canvas.slug}`}
                  aria-label={canvas.name}
                  className="absolute inset-0"
                />
                {/* min-w-0 on every column is what keeps rows aligned WITH EACH OTHER:
                    a flex item defaults to min-width:auto, so without it a long canvas
                    name or an unwrapped "yesterday" re-negotiates that row column
                    widths and no two rows share a boundary. */}
                <div className="pointer-events-none relative flex min-w-0 items-center py-3.5">
                  <div className="flex min-w-0 flex-1 items-center gap-4 pl-5">
                    <span className="min-w-0 flex-[3] truncate font-medium">{canvas.name}</span>
                    <span className="flex min-w-0 flex-[2] items-center justify-end gap-2.5 text-sm text-muted-foreground">
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
                      <span className="truncate">{canvas.client_name}</span>
                    </span>
                    {/* nowrap: "3d ago" breaking onto two lines was both ugly and the
                        thing that widened this column and shoved the others left. */}
                    <span className="min-w-0 flex-1 truncate text-right text-sm whitespace-nowrap text-muted-foreground">
                      {formatRelativeTime(canvas.updated_at)}
                    </span>
                  </div>
                  {/* Row actions — their own fixed gutter, so they never eat into the
                      Last edited column and pull the dates out from under its header. */}
                  <div className="flex w-32 shrink-0 items-center justify-end gap-3 pr-5">
                    <Button
                      variant="outline"
                      size="xs"
                      nativeButton={false}
                      className="pointer-events-auto relative z-10 border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary dark:border-border dark:bg-background dark:hover:bg-primary/5"
                      render={
                        <Link
                          href={`/eval/${canvas.id}`}
                          title="Error analysis — inspect this canvas's generations"
                        >
                          <Microscope className="size-3.5" strokeWidth={1.5} /> Evals
                        </Link>
                      }
                    />
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
