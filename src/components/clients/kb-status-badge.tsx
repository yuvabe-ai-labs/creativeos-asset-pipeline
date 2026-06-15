import { cn } from "@/lib/utils";
import type { ClientRow } from "@/lib/db/types";

const STYLES: Record<ClientRow["kb_status"], { label: string; className: string }> = {
  ready: {
    label: "Ready",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  in_review: {
    label: "In review",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  pending: {
    label: "Pending",
    className: "bg-muted text-muted-foreground",
  },
};

export function KBStatusBadge({ status }: { status: ClientRow["kb_status"] }) {
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
