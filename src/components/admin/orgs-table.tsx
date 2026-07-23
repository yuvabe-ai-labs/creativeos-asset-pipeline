"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { filterAndSort, type SortKey } from "@/lib/list/filter-sort";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { initials } from "@/lib/format/initials";
import type { OrgWithCount } from "@/lib/db/organizations";

export function OrgsTable({ orgs }: { orgs: OrgWithCount[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const rows = useMemo(
    () =>
      filterAndSort(orgs, query, sort, {
        name: (o) => o.name,
        timestamp: (o) => o.created_at,
      }),
    [orgs, query, sort],
  );

  return (
    <div>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        placeholder="Search organizations…"
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="text-eyebrow flex items-center gap-4 border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
          <span className="flex-[3]">Org</span>
          <span className="flex-1">Clients</span>
          <span className="flex-1">Credit limit</span>
          <span className="flex-1 text-right">Created</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No organizations match "{query}".
          </p>
        ) : (
          <ul>
            {rows.map((org) => (
              <li
                key={org.id}
                className="border-b last:border-b-0 hover:bg-muted/40"
              >
                <Link
                  href={`/admin/orgs/${org.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                >
                  <span className="flex flex-[3] items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-xs font-semibold text-muted-foreground/50">
                      {initials(org.name)}
                    </span>
                    <span className="font-medium">{org.name}</span>
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {org.client_count} client{org.client_count === 1 ? "" : "s"}
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {org.monthly_credit_limit === null
                      ? "Unlimited"
                      : org.monthly_credit_limit}
                  </span>
                  <span className="flex-1 text-right text-sm text-muted-foreground">
                    {formatRelativeTime(org.created_at)}
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
