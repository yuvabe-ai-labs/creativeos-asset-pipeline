import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/lib/approval";

// D29: on-canvas approval pill. Same shape/palette as KBStatusBadge for consistency.
const STYLES: Record<ApprovalStatus, { label: string; className: string }> = {
  approved: {
    label: "Approved",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  changes_requested: {
    label: "Changes requested",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  pending: {
    label: "Pending",
    className: "bg-muted text-muted-foreground",
  },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}
