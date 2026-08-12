"use client";

import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Org's "used this month" figure, shown inside ProfilePopover. Purely presentational — it
 * renders what the parent hands it.
 *
 * The Realtime subscription and the running delta deliberately do NOT live here: Base UI's
 * Popover.Portal unmounts this component whenever the popover closes, which is exactly when
 * credits get consumed. Owning that state here meant the subscription was dead at the only
 * moment it mattered and the delta was thrown away on every close, so the figure sat at its
 * page-load value until a manual refresh. ProfilePopover owns both because it stays mounted.
 */
export function ProfileCredits({
  used,
  monthlyCreditLimit,
}: {
  used: number;
  monthlyCreditLimit: number | null;
}) {
  const over = monthlyCreditLimit !== null && used > monthlyCreditLimit;
  const fillPct =
    monthlyCreditLimit !== null && monthlyCreditLimit > 0
      ? Math.min(used / monthlyCreditLimit, 1) * 100
      : null;

  return (
    <div className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Zap
          className={cn(
            "size-4 shrink-0",
            over ? "text-amber-600 dark:text-amber-400" : "text-primary",
          )}
          strokeWidth={1.5}
        />
        <span className="text-eyebrow" style={{ letterSpacing: "0.1em" }}>
          Credits
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-base leading-none font-semibold",
            over ? "text-amber-600 dark:text-amber-400" : "text-foreground",
          )}
        >
          {used.toLocaleString()}
        </span>
        {monthlyCreditLimit !== null && (
          <span className="text-sm leading-none text-muted-foreground">
            / {monthlyCreditLimit.toLocaleString()}
          </span>
        )}
      </div>
      {fillPct !== null && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              over ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${over ? 100 : fillPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
