"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { KBStatusBadge } from "@/components/clients/kb-status-badge";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { ClientWithCount } from "@/lib/db/clients";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ClientsTable({ clients }: { clients: ClientWithCount[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const rows = useMemo(
    () =>
      filterAndSort(clients, query, sort, {
        name: (c) => c.name,
        timestamp: (c) => c.last_active,
      }),
    [clients, query, sort],
  );

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        placeholder="Search clients…"
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="text-eyebrow flex items-center gap-4 border-b px-4 py-2.5 text-muted-foreground">
          <span className="flex-[3]">Client</span>
          <span className="flex-[2]">Activity</span>
          <span className="flex-1 text-right">Brand KB</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No clients match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((client) => (
              <li key={client.id} className="border-b last:border-b-0">
                <Link
                  href={`/clients/${client.slug}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="flex flex-[3] items-center gap-3">
                    {client.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={client.logo_url}
                        alt=""
                        className="size-9 shrink-0 rounded-md border bg-card object-contain p-1"
                      />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-xs font-semibold text-muted-foreground/50">
                        {initials(client.name)}
                      </span>
                    )}
                    <span className="font-medium">{client.name}</span>
                  </span>
                  <span className="flex-[2] text-sm text-muted-foreground">
                    {client.canvas_count} canvas
                    {client.canvas_count === 1 ? "" : "es"}
                    <span className="text-muted-foreground/60">
                      {" · "}
                      {formatRelativeTime(client.last_active)}
                    </span>
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2">
                    <KBStatusBadge status={client.kb_status} />
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
