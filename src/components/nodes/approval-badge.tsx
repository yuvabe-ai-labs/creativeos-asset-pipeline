import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/lib/approval";

// D29: on-canvas approval pill. A leading status dot + a bordered chip. Only the two
// states that need operator attention carry color — pending reads as a WARNING (amber),
// changes-requested as an ERROR (the `destructive` token). Approved is the resolved
// state, so it recedes into neutral (token-driven border/muted/foreground). Amber has no
// system token, so it's the same hardcoded-status exception used by KBStatusBadge.
const STYLES: Record<ApprovalStatus, { label: string; chip: string; dot: string }> = {
  approved: {
    label: "Approved",
    chip: "border-border bg-muted text-foreground",
    dot: "bg-muted-foreground/60",
  },
  pending: {
    label: "Pending",
    chip: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  changes_requested: {
    label: "Changes requested",
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const { label, chip, dot } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold",
        chip,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      {label}
    </span>
  );
}
