"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Microscope } from "lucide-react";
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
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-[3]">Canvas</span>
          <span className="flex-[2]">Last edited</span>
          <span className="flex-1 text-right">Created</span>
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
                {/* Stretched link — the whole row opens the editor; the Evals action
                    re-enables pointer events and sits above it. */}
                <Link
                  href={`/clients/${clientSlug}/canvases/${canvas.slug}`}
                  aria-label={canvas.name}
                  className="absolute inset-0"
                />
                <div className="pointer-events-none relative flex items-center gap-4 px-5 py-3.5">
                  <span className="flex-[3] font-medium">{canvas.name}</span>
                  <span className="flex-[2] text-sm text-muted-foreground">
                    {formatRelativeTime(canvas.updated_at)}
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-3 text-sm text-muted-foreground">
                    {new Date(canvas.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                    <Link
                      href={`/eval/${canvas.id}`}
                      title="Error analysis — inspect this canvas's generations"
                      className="pointer-events-auto relative z-10 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                      <Microscope className="size-3.5" strokeWidth={1.5} /> Evals
                    </Link>
                    <ChevronRight
                      className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                    />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
