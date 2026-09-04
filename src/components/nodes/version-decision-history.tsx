"use client";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { ApprovalStatusIcon } from "@/components/review/approval-status-icon";
import type { VersionDecisionSummary } from "@/lib/approval";

// D173: a version's full decision history, newest first (the versions route already orders
// it — this renders, it does not re-sort). Shared by both ImageGenVersionHistory and
// VideoGenVersionHistory rather than duplicated in each.
//
// The status marker is ApprovalStatusIcon (D178), the same one the collapsed row, the
// navbar inbox and the rail badge use — this file deliberately owns no icon vocabulary of
// its own.
export function VersionDecisionThread({
  decisions,
}: {
  decisions: VersionDecisionSummary[];
}) {
  if (decisions.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      {decisions.map((d) => (
        <div key={d.id} className="flex items-start gap-1.5">
          <ApprovalStatusIcon status={d.status} className="mt-0.5" />
          <div className="min-w-0">
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
            {/* D213: the thread says a decision CARRIES regions without rendering them —
                the pictures live on the media pane, this is the count that sends you there. */}
            {d.annotations && d.annotations.length > 0 && (
              <p className="mt-0.5 text-[0.6rem] text-muted-foreground">
                {d.annotations.length} annotation
                {d.annotations.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
