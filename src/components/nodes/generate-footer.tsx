"use client";

import type { ReactNode } from "react";
import { Loader2, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EstimatedCreditsLabel } from "./estimated-credits-label";

/**
 * D435 — every node's Generate / Re-generate, the same everywhere: pinned to the foot of the
 * settings column while it scrolls, full width, the node's icon, the estimate, and why it is
 * unavailable on hover. Place it LAST, as a direct child of the column's content wrapper (a sticky
 * element sticks only within its parent), give that wrapper `min-h-full` so a short column still
 * puts it at the foot (`mt-auto`), and cancel the wrapper's padding with `className` (e.g.
 * "-mx-6 -mb-5" inside "px-6 py-5"). Or place it under a scrolling area, outside it.
 */
export function GenerateFooter({
  label,
  busy,
  busyLabel = "Generating…",
  onClick,
  disabled,
  disabledReason,
  credits,
  estimating = false,
  icon: Icon = Sparkles,
  notice,
  className,
}: {
  /** "Generate motion prompt" the first time, "Re-generate" once there is an output. */
  label: string;
  busy: boolean;
  busyLabel?: string;
  onClick: () => void;
  disabled: boolean;
  /** Shown on hover while disabled; null when the state speaks for itself. */
  disabledReason?: string | null;
  credits: number | null;
  estimating?: boolean;
  icon?: LucideIcon;
  /** A line above the button (e.g. "Generate acts on the active version"). */
  notice?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("sticky bottom-0 z-10 mt-auto flex flex-col gap-2 border-t border-border bg-card px-6 py-3", className)}>
      {notice}
      <TooltipProvider>
        <Tooltip>
          {/* A disabled button gets no pointer events, so the trigger is a span around it. */}
          <TooltipTrigger render={<span className="block w-full" />}>
            <Button size="lg" className="w-full" onClick={onClick} disabled={disabled}>
              {estimating ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Icon className="size-4" strokeWidth={1.5} />
              )}
              {busy ? busyLabel : label}
              {!busy && !estimating && credits !== null && <EstimatedCreditsLabel credits={credits} />}
            </Button>
          </TooltipTrigger>
          {disabled && disabledReason ? (
            <TooltipContent side="top" className="max-w-56 text-center">{disabledReason}</TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
