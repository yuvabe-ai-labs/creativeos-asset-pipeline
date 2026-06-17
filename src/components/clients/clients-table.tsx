"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { KBStatusBadge } from "@/components/clients/kb-status-badge";
import { ClientRowActions } from "@/components/clients/client-row-actions";
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

export function ClientsTable({
  clients,
  archived = false,
}: {
  clients: ClientWithCount[];
  archived?: boolean;
}) {
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
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-[3]">Client</span>
          <span className="flex-[2]">Last active</span>
          <span className="flex-1 text-right">Brand KB</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No clients match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((client) => (
              <li
                key={client.id}
                className="flex items-center border-b last:border-b-0 hover:bg-muted/40"
              >
                <Link
                  href={`/clients/${client.slug}`}
                  className="flex flex-1 items-center gap-4 px-5 py-3.5 transition-colors"
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
                    <span className="font-medium">
                      {client.name}
                      <span className="ml-1.5 font-normal text-muted-foreground/60">
                        ({client.canvas_count})
                      </span>
                    </span>
                  </span>
                  <span className="flex-[2] text-sm text-muted-foreground">
                    {formatRelativeTime(client.last_active)}
                  </span>
                  <span className="flex flex-1 items-center justify-end gap-2">
                    <KBStatusBadge status={client.kb_status} />
                  </span>
                </Link>
                <div className="pr-3 pl-1">
                  <ClientRowActions clientId={client.id} archived={archived} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
