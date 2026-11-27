"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { USAGE_PERIOD_LABEL } from "@/lib/billing/usage-period";
import { USAGE_GROUP_TITLE as GROUP_TITLE, type UsageGroupBy, type UsageGroupRow, type UsageOverview } from "@/lib/billing/usage-overview";
import { UsageRow } from "./usage-row";
import { UsageRunsList } from "./usage-runs-list";

export type UsageSheetView =
  | { view: "rows"; by: UsageGroupBy }
  | { view: "runs"; by: UsageGroupBy; row: UsageGroupRow; back: UsageGroupBy | null };


const n = (v: number) => Math.round(v).toLocaleString("en-IN");

// The Usage page's one side panel (D597): every row of a breakdown (See all), or one row's runs.
// From a list, a row opens its runs with a way back.
export function UsageSheet({ overview, view, onChange }: { overview: UsageOverview; view: UsageSheetView | null; onChange: (v: UsageSheetView | null) => void }) {
  const period = USAGE_PERIOD_LABEL[overview.period];
  const row = view?.view === "runs" ? view.row : null;
  return (
    <Sheet open={!!view} onOpenChange={(open) => !open && onChange(null)}>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {view && (
          <>
            <SheetHeader className="flex-row items-start gap-2 border-b border-border p-5 pr-12">
              {view.view === "runs" && view.back && (
                <Button variant="ghost" size="icon-sm" aria-label={`Back to ${GROUP_TITLE[view.back].toLowerCase()}`} onClick={() => onChange({ view: "rows", by: view.back! })}>
                  <ArrowLeft strokeWidth={1.5} />
                </Button>
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <SheetTitle className="truncate font-display text-base font-semibold tracking-tight">{row ? row.name : GROUP_TITLE[view.by]}</SheetTitle>
                <SheetDescription>
                  {row
                    ? `${row.detail ? `${row.detail} · ` : ""}${period} · ${n(row.credits)} credits · ${row.runs === 1 ? "1 run" : `${n(row.runs)} runs`}`
                    : `${period} · ${n(overview.total)} credits`}
                </SheetDescription>
              </div>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {row ? (
                <div className="px-5 pb-5">
                  <UsageRunsList key={`${view.by}:${row.key}:${overview.period}`} by={view.by} rowKey={row.key} period={overview.period} />
                </div>
              ) : (
                <ul className="flex flex-col py-2">
                  {overview.groups[view.by].map((r) => (
                    <li key={r.removed ? "removed" : r.key ?? "none"}>
                      <UsageRow row={r} total={overview.total} onOpen={() => onChange({ view: "runs", by: view.by, row: r, back: view.by })} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
