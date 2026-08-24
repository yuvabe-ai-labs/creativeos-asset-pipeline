"use client";

import { Check, MessageSquareWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { ApprovalStatus, VersionDecisionSummary } from "@/lib/approval";

// D176/D177: the same colored status marker InlineApprovalBar's STATUS_META and the
// navbar inbox tag (review-inbox.tsx) already use — amber/emerald/destructive, never a
// fourth color. Collapsed version-history rows show this instead of the old plain dot.
export function VersionStatusIcon({ status }: { status: ApprovalStatus | undefined }) {
  if (status === "approved") {
    return (
      <Check
        className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
        strokeWidth={1.5}
      />
    );
  }
  if (status === "changes_requested") {
    return (
      <MessageSquareWarning className="size-3 shrink-0 text-destructive" strokeWidth={1.5} />
    );
  }
  return <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />;
}

// D173/D177: a version's full decision history, newest first (the versions route already
// orders it — this renders, it does not re-sort). Icons/colors reused from
// InlineApprovalBar's own Approve/Reject buttons, not a new icon vocabulary. Shared by
// both ImageGenVersionHistory and VideoGenVersionHistory rather than duplicated in each.
export function VersionDecisionThread({
  decisions,
}: {
  decisions: VersionDecisionSummary[];
}) {
  if (decisions.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      {decisions.map((d, i) => (
        <div key={i} className="flex items-start gap-1.5">
          {d.status === "approved" ? (
            <Check
              className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
              strokeWidth={1.5}
            />
          ) : (
            <MessageSquareWarning
              className="mt-0.5 size-3 shrink-0 text-destructive"
              strokeWidth={1.5}
            />
          )}
          <p
            className={cn(
              "text-[0.65rem] leading-snug",
              d.status === "approved" ? "text-muted-foreground" : "text-destructive/80",
            )}
          >
            <span className="font-medium">{d.reviewerName ?? "Someone"}</span>{" "}
            {d.status === "approved" ? "approved" : "requested changes"} ·{" "}
            {formatRelativeTime(d.decidedAt)}
            {d.note && <>: {d.note}</>}
          </p>
        </div>
      ))}
    </div>
  );
}
