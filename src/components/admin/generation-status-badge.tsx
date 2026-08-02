import { cn } from "@/lib/utils";
import type { GenerationRow } from "@/lib/db/types";

const STYLES: Record<GenerationRow["status"], { label: string; className: string }> = {
  succeeded: {
    label: "Succeeded",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  running: {
    label: "Running",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
};

export function GenerationStatusBadge({ status }: { status: GenerationRow["status"] }) {
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
