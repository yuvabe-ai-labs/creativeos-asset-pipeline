"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AgencyRow } from "@/lib/admin/agencies-list";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

const BAR = { normal: "bg-muted-foreground/45", warn: "bg-warning", bad: "bg-destructive" } as const;

// Credits this month: used of the limit with a bar that stays grey until the limit is close, or
// the used total alone when there is no limit. What is left shows on hover (mouse only: the
// trigger is not focusable and touch doesn't open it), so nothing needs a hover to be read.
export function AgencyCreditsCell({ credits }: { credits: AgencyRow["credits"] }) {
  const { used, limit, percent, bar, noLimit, tip } = credits;
  return (
    <Tooltip>
      {/* Not a button: the row's link is the focus stop, and the tip only adds detail. */}
      <TooltipTrigger delay={300} render={<div className="min-w-36" />}>
        {limit === null || percent === null ? (
          <>
            <div className="flex justify-between gap-2 text-[0.8rem]">
              <span className="tabular-nums">{fmt(used)}</span>
              <span className="text-muted-foreground">{noLimit}</span>
            </div>
            <div className="text-xs text-muted-foreground">used this month</div>
          </>
        ) : (
          <>
            <div className="mb-1.5 flex justify-between gap-2 text-[0.8rem]">
              <span className="tabular-nums">
                {fmt(used)} <span className="text-muted-foreground">of {fmt(limit)}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">{percent}%</span>
            </div>
            <div
              role="meter"
              aria-label="Credits used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className={cn("h-full rounded-full", BAR[bar])} style={{ width: `${percent}%` }} />
            </div>
          </>
        )}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
