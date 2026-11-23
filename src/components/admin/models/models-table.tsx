"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export type ModelListRow = {
  id: string;
  label: string;
  provider: string;
  kind: string;
  status: string;
  problems: string[];
  priceSummary: string | null;
  runs: number;
  costUsd: number;
  unpriced: number;
};

const ALL = "all";

function statusVariant(status: string) {
  if (status === "live") return "default" as const;
  if (status === "hidden") return "secondary" as const;
  return "outline" as const;
}

export function ModelsTable({ rows }: { rows: ModelListRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const kinds = useMemo(() => [...new Set(rows.map((r) => r.kind))].sort(), [rows]);
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))].sort(), [rows]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = rows.filter(
      (r) =>
        (kind === ALL || r.kind === kind) &&
        (status === ALL || r.status === status) &&
        (q === "" || r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)),
    );
    const byKind = new Map<string, ModelListRow[]>();
    for (const r of shown) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
    return [...byKind.entries()];
  }, [rows, query, kind, status]);

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <ListToolbar
            query={query}
            onQueryChange={setQuery}
            placeholder="Search models…"
          />
        </div>
        <Select value={kind} onValueChange={(v) => v && setKind(v)}>
          <SelectTrigger className="h-11 w-36 rounded-xl">
            <SelectValue>{kind === ALL ? "All kinds" : kind}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All kinds</SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger className="h-11 w-40 rounded-xl">
            <SelectValue>{status === ALL ? "All statuses" : status}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {groups.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No models match.
          </p>
        ) : (
          groups.map(([groupKind, items]) => (
            <section key={groupKind}>
              <h2 className="text-eyebrow border-b bg-muted/40 px-5 py-3 text-[0.7rem] text-muted-foreground/80">
                {groupKind}
              </h2>
              <ul>
                {items.map((r) => (
                  <li key={r.id} className="border-b last:border-b-0 hover:bg-muted/40">
                    <Link
                      href={`/admin/models/${encodeURIComponent(r.id)}`}
                      className="flex items-center gap-4 px-5 py-3.5 transition-colors"
                    >
                      <span className="flex min-w-0 flex-[3] flex-col">
                        <span className="truncate font-medium">{r.label}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {r.provider}
                        </span>
                      </span>
                      <span className="flex-1">
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      </span>
                      <span className="flex-[2] text-sm text-muted-foreground">
                        {r.problems.length > 0
                          ? "Fails its check"
                          : (r.priceSummary ?? "No price")}
                      </span>
                      <span className="w-16 text-right text-sm text-muted-foreground">
                        {r.runs} {r.runs === 1 ? "run" : "runs"}
                      </span>
                      <span className="w-20 text-right text-sm font-medium">
                        ${r.costUsd.toFixed(2)}
                      </span>
                      <span className="w-24 text-right">
                        {r.unpriced > 0 && (
                          <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-text">{r.unpriced} unpriced</Badge>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
