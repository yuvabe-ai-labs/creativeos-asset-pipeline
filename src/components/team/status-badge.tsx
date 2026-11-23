import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/people/constants";
import type { PersonStatus } from "@/lib/people/types";

export type PeopleStatus = PersonStatus | "invited";

const LOOKS: Record<PeopleStatus, { pill: string; dot: string }> = {
  owner: { pill: "border-primary/30 bg-primary/5 text-primary", dot: "bg-primary" },
  member: { pill: "border-border bg-card text-foreground/80", dot: "bg-muted-foreground/50" },
  signed_up: { pill: "border-warning/50 bg-warning/10 text-warning-text", dot: "bg-warning" },
  invited: { pill: "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground", dot: "bg-muted-foreground/40" },
};

// One look per status (spec §2.4), on the Team page, every Members list and the person panel.
export function StatusBadge({ status }: { status: PeopleStatus }) {
  const look = LOOKS[status];
  return (
    <span
      data-status={status}
      className={cn("inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", look.pill)}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", look.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}
