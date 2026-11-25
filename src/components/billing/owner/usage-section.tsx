"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedChoice } from "@/components/admin/billing/segmented-choice";
import { useUsage } from "@/hooks/queries/billing-usage";
import type { UsageBy, UsagePeriod } from "@/lib/billing/usage-period";
import { cn } from "@/lib/utils";
import { UsageRuns } from "./usage-runs";

const BY_OPTIONS: { value: UsageBy; label: string }[] = [
  { value: "member", label: "Members" },
  { value: "client", label: "Clients" },
  { value: "canvas", label: "Canvases" },
];
const PERIOD_OPTIONS: { value: UsagePeriod; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

const n = (v: number) => Math.round(v).toLocaleString("en-IN");

// Who used what (D583): credits charged this or last month by member, client or canvas, each row
// opening to its runs. One request per view; the rows' share bars need nothing more.
export function UsageSection() {
  const [by, setBy] = useState<UsageBy>("member");
  const [period, setPeriod] = useState<UsagePeriod>("this_month");
  const [open, setOpen] = useState<string | null>(null);
  const { data, isPending, isError } = useUsage(by, period);
  const choose = <T,>(set: (v: T) => void) => (v: T) => { set(v); setOpen(null); };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-xl font-semibold tracking-tight">Who used what</h2>
          <p className="text-sm text-muted-foreground">{data ? `${n(data.total)} credits used ${period === "this_month" ? "this month" : "last month"}.` : "Credits used, by who made the run and where."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedChoice value={by} options={BY_OPTIONS} onChange={choose(setBy)} />
          <SegmentedChoice value={period} options={PERIOD_OPTIONS} onChange={choose(setPeriod)} />
        </div>
      </div>
      <Card className="gap-0 py-0 shadow-card">
        {isPending ? (
          <div className="flex flex-col gap-3 p-5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : isError ? (
          <p className="p-5 text-sm text-muted-foreground">Usage couldn&apos;t be loaded. Try again in a moment.</p>
        ) : data.rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No credits used {period === "this_month" ? "this month" : "last month"} yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.rows.map((row) => {
              const id = row.key ?? "none";
              const isOpen = open === id;
              const share = data.total > 0 ? (row.credits / data.total) * 100 : 0;
              return (
                <li key={id} className="flex flex-col">
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start rounded-none px-5 py-3 text-left hover:bg-muted/40"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : id)}
                  >
                    <span className="flex w-full flex-col gap-1.5">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{row.name}</span>
                          {row.detail && <span className="truncate text-xs text-muted-foreground">{row.detail}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-sm">
                          {n(row.credits)}
                          <span className="text-xs text-muted-foreground">{row.runs === 1 ? "1 run" : `${row.runs} runs`}</span>
                          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} strokeWidth={1.5} />
                        </span>
                      </span>
                      <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-primary/60" style={{ width: `${share}%` }} />
                      </span>
                    </span>
                  </Button>
                  {isOpen && <UsageRuns by={by} rowKey={row.key} period={period} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
