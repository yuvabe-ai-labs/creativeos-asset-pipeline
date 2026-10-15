"use client";

import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

export type UsageRow = {
  label: string;   // e.g. "v1", "v2"
  meta?: string;   // e.g. "1,234 tokens" or "1,234 in · 567 out"
  /** Formatted credits, e.g. "40". Pass "—" for a legacy version with no settled credits. */
  credits: string;
  time?: string;   // relative time string
};

/** Optional summary rows shown in the "Overall" section above the total. */
export type OverallRow = {
  label: string;
  value: string;
};

export function UsagePopoverShell({
  rows,
  overallRows,
  totalCredits,
  pipelineTotalCredits,
  pipelineLoading,
}: {
  rows: UsageRow[];
  /** Extra key/value rows shown in the Overall section (e.g. token counts). */
  overallRows?: OverallRow[];
  /** Formatted total credits for this node, e.g. "120 credits" */
  totalCredits: string;
  /** Full upstream pipeline total (this node + all connected upstream nodes), in credits. */
  pipelineTotalCredits?: string;
  /** True while a pipeline total is expected but hasn't loaded yet — shows a skeleton
   * instead of flashing this node's own (smaller, wrong) total first. */
  pipelineLoading?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          /* The credits total IS the trigger — no "Usage" label. Link variant
             (primary color, underline on hover) so it reads as clickable; the
             popover holds the per-generation breakdown. Same guard as the body:
             while the pipeline total is loading, don't flash this node's own
             (smaller) total. */
          <Button variant="link" size="sm" type="button">
            <ReceiptText className="size-3.5" strokeWidth={1.5} />
            {pipelineLoading ? (
              <Skeleton className="h-3 w-16" />
            ) : (
              <span className="tabular-nums">
                {pipelineTotalCredits ?? totalCredits} used
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-4">
        {pipelineLoading ? (
          <UsagePopoverSkeleton rowCount={rows.length || 3} />
        ) : rows.length === 0 ? (
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
                <p className="text-sm font-semibold text-foreground">
                  {pipelineTotalCredits ?? totalCredits}
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
                        {row.credits === "—" ? (
                          <span className="font-normal text-muted-foreground">—</span>
                        ) : (
                          row.credits
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

// Mirrors the real content's shape (Overall section + per-generation list) so nothing
// reflows when the real data swaps in — shown for the whole popover, not just the total
// row, so the content never shows a mix of real and placeholder data at once.
function UsagePopoverSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-eyebrow">Overall</p>
        <div className="pt-0.5">
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-eyebrow">Per generation</p>
        <ul className="max-h-48 space-y-2 overflow-y-auto">
          {Array.from({ length: rowCount }).map((_, i) => (
            <li key={i} className="rounded-md bg-muted/50 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="mt-1 flex items-center justify-between">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-6" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
