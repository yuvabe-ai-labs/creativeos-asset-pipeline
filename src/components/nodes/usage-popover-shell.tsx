"use client";

import { ReceiptText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type UsageRow = {
  label: string;   // e.g. "v1", "v2"
  meta?: string;   // e.g. "1,234 tokens" or "1,234 in · 567 out"
  /** USD portion, e.g. "$0.0024". Pass "—" if unknown. */
  costUsd: string;
  /** INR portion shown in muted color, e.g. "₹0.20". Omit when costUsd is "—". */
  costInr?: string;
  time?: string;   // relative time string
};

/** Optional summary rows shown in the "Overall" section above the total cost. */
export type OverallRow = {
  label: string;
  value: string;
};

export function UsagePopoverShell({
  rows,
  overallRows,
  totalCostUsd,
  totalCostInr,
  modelLabel,
}: {
  rows: UsageRow[];
  /** Extra key/value rows shown in the Overall section (e.g. token counts). */
  overallRows?: OverallRow[];
  /** Formatted USD total, e.g. "$0.0024" */
  totalCostUsd: string;
  /** Formatted INR total shown in muted color, e.g. "₹0.20" */
  totalCostInr?: string;
  modelLabel?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ReceiptText className="size-3.5" strokeWidth={1.5} />
            Usage
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 p-4">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No usage data yet.</p>
        ) : (
          <div className="space-y-4">
            {/* Overall section */}
            <div className="space-y-2">
              <p className="text-eyebrow">Overall</p>
              {overallRows && overallRows.length > 0 && (
                <div className="space-y-1.5">
                  {overallRows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-6">
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                      <span className="text-xs font-medium tabular-nums text-foreground">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-0.5">
                {modelLabel && (
                  <p className="mb-0.5 text-[0.6rem] text-muted-foreground">{modelLabel}</p>
                )}
                <p className="text-sm font-semibold text-foreground">
                  {totalCostUsd}{" "}
                  {totalCostInr && (
                    <span className="font-normal text-muted-foreground">({totalCostInr})</span>
                  )}
                </p>
              </div>
            </div>

            {/* Per-generation section */}
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-eyebrow">Per generation</p>
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {rows.map((row, i) => (
                  <li key={`${row.label}-${i}`} className="rounded-md bg-muted/50 px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{row.label}</span>
                      {row.time && (
                        <span className="text-[0.65rem] text-muted-foreground">{row.time}</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      {row.meta ? (
                        <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                          {row.meta}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="text-[0.65rem] font-medium tabular-nums text-foreground">
                        {row.costUsd === "—" ? (
                          <span className="font-normal text-muted-foreground">—</span>
                        ) : (
                          <>
                            {row.costUsd}{" "}
                            {row.costInr && (
                              <span className="font-normal text-muted-foreground">({row.costInr})</span>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
