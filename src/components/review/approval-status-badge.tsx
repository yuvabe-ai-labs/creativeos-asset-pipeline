"use client";

import { cn } from "@/lib/utils";
import { ApprovalStatusIcon } from "./approval-status-icon";
import type { ApprovalStatus } from "@/lib/approval";

// D178: the focus-view rail badge — ONE copy, replacing three verbatim ones (image-gen,
// prompt, video-prompt) that had quietly drifted out of step with the rest of the product.
//
// They rendered `changes_requested` in AMBER and `pending` in neutral grey, while every
// other approval surface reserves amber for `pending` and the destructive token for a
// rejection. Same state, two colours, depending which panel you were looking at. The
// mapping now lives here once, beside the icon vocabulary it shares.
const BADGE: Record<ApprovalStatus, { label: string; className: string }> = {
  approved: {
    label: "Approved",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-400",
  },
  changes_requested: {
    label: "Changes",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  pending: {
    label: "Pending",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400",
  },
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const { label, className } = BADGE[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold",
        className,
      )}
    >
      <ApprovalStatusIcon status={status} />
      {label}
    </span>
  );
}
