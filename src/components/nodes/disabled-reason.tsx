"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// A disabled control can't receive hover, so the tooltip hangs on a wrapping span (the same shape
// as Video Gen's Generate button). With no reason it renders the control as-is.
export function DisabledReason({ reason, className = "block w-full", children }: {
  reason: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} />}>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}
