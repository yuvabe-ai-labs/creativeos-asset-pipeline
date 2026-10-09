"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { KBStatusBadge } from "@/components/clients/kb-status-badge";
import { PendingCountPill } from "@/components/shared/pending-count-pill";
import { TruncatedText } from "@/components/ui/truncated-text";
import { ClientRowActions } from "@/components/clients/client-row-actions";
import { filterAndSort } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { initials } from "@/lib/format/initials";
import type { ClientWithCount } from "@/lib/db/clients";

export function ClientsTable({
  clients,
  archived = false,
  counts = {},
}: {
  clients: ClientWithCount[];
  archived?: boolean;
  // R5.1 — pending-review count per client id. Defaults to {} so the archived table works
  // unchanged: archived clients deliberately carry no counts, since flagging review work
  // in a recovery view would point at canvases nobody is meant to be working on.
  counts?: Record<string, number>;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () =>
      filterAndSort(clients, query, "recent", {
        name: (c) => c.name,
        timestamp: (c) => c.last_active,
      }),
    [clients, query],
  );

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Search clients…"
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {/* Mirrors the row nesting exactly: an inner flex-1 track holding the three
            columns, plus a w-12 sibling standing in for the row-actions gutter
            (size-8 + pl-1 + pr-3). Flattening these into one flex row would add a
            fourth gap-4 the rows never spend, pushing every header 16px off column. */}
        <div className="text-eyebrow flex items-center border-b bg-muted/40 py-3 text-[0.7rem] text-muted-foreground/80">
          <div className="flex min-w-0 flex-1 items-center gap-4 px-5">
            <span className="min-w-0 flex-[3]">Client</span>
            <span className="min-w-0 flex-[2] text-right">Last active</span>
            <span className="min-w-0 flex-1 text-right">Brand KB</span>
          </div>
          <span className="w-12 shrink-0" aria-hidden />
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
                  className="flex min-w-0 flex-1 items-center gap-4 px-5 py-3.5 transition-colors"
                >
                  <span className="flex min-w-0 flex-[3] items-center gap-3">
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
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <TruncatedText className="font-medium">
                        {client.name}
                      </TruncatedText>
                      <span className="shrink-0 text-muted-foreground/60">
                        ({client.canvas_count})
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0 flex-[2] truncate text-right text-sm whitespace-nowrap text-muted-foreground">
                    {formatRelativeTime(client.last_active)}
                  </span>
                  {/* min-w-0 from staging's truncation work; the pill is R5.1's count. */}
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <PendingCountPill count={counts[client.id] ?? 0} scope="client" />
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
