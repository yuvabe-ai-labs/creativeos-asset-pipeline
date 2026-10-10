"use client";

import { useMemo, useState } from "react";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { ClientTile } from "@/components/clients/client-tile";
import { filterAndSort } from "@/lib/list/filter-sort";
import type { ClientWithCount } from "@/lib/db/clients";

export function ClientsGrid({
  clients,
  archived = false,
  counts = {},
}: {
  clients: ClientWithCount[];
  archived?: boolean;
  // R5.1 — pending-review count per client id. Defaults to {} so the archived grid works
  // unchanged: archived clients deliberately carry no counts, since flagging review work
  // in a recovery view would point at canvases nobody is meant to be working on.
  counts?: Record<string, number>;
}) {
  const [query, setQuery] = useState("");

  const tiles = useMemo(
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

      {tiles.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No clients match “{query}”.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
          {tiles.map((client) => (
            <ClientTile
              key={client.id}
              client={client}
              archived={archived}
              pendingCount={counts[client.id] ?? 0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
