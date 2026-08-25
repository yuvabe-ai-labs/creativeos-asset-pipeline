"use client";

import { Check, MessageSquareWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/lib/approval";

// D178: THE approval-status marker for the whole product — emerald check = approved,
// destructive flag = changes requested, amber dot = pending (still awaiting a reviewer).
//
// Every surface that shows an approval outcome renders this: the version-history rows and
// their decision threads, the navbar review inbox, and the focus-view rail badge. One
// component rather than four hand-rolled copies, so a colour or an icon can never come to
// mean two different things on two different screens — the same reason D163's status set
// is written down once.
//
// The icons are the two InlineApprovalBar already uses for its own Approve / Request
// changes buttons, so the marker a reviewer sees afterwards is the one they clicked.
export function ApprovalStatusIcon({
  status,
  className,
}: {
  status: ApprovalStatus | undefined;
  className?: string;
}) {
  if (status === "approved") {
    return (
      <Check
        className={cn("size-3 shrink-0 text-emerald-600 dark:text-emerald-400", className)}
        strokeWidth={1.5}
      />
    );
  }
  if (status === "changes_requested") {
    return (
      <MessageSquareWarning
        className={cn("size-3 shrink-0 text-destructive", className)}
        strokeWidth={1.5}
      />
    );
  }
  return (
    <span className={cn("size-1.5 shrink-0 rounded-full bg-amber-500", className)} />
  );
}
