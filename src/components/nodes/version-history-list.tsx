"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { ApprovalStatusIcon } from "@/components/review/approval-status-icon";
import { VersionDecisionThread } from "./version-decision-history";
import type { ApprovalStatus, VersionDecisionSummary } from "@/lib/approval";

// D180: ONE version-history list, shared by every node type that has versions.
//
// There were three near-identical copies (image-gen, video-gen, prompt) and they had
// already drifted: prompt kept a whole-row-click-to-restore button, its own duplicate
// relative-time helper, a plain status dot instead of the shared icon, and no decision
// thread at all — so the same version read differently depending which node you opened.
// The shell owns everything that must look the same everywhere; each node type supplies
// only the two things that genuinely differ.
export type VersionHistoryRow = {
  id: string;
  createdAt: string;
  error: string | null;
  approvalStatus?: ApprovalStatus;
  makerName?: string | null;
  decisions?: VersionDecisionSummary[];
  /** The type-specific preview: an `<img>`, a `<video>`, or nothing for prompt nodes. */
  thumb?: ReactNode;
  /** Type-specific metadata lines, rendered when the row is expanded. */
  meta?: ReactNode;
};

export function VersionHistoryList({
  rows,
  activeVersionId,
  onRestore,
  restoring,
  hideHeader = false,
}: {
  rows: VersionHistoryRow[];
  activeVersionId: string | null;
  onRestore: (versionId: string) => void;
  restoring: boolean;
  hideHeader?: boolean;
}) {
  const total = rows.length;

  // D176: the active version starts expanded; everything else starts collapsed. Tracks
  // activeVersionId changes (e.g. after a restore) without force-collapsing rows the user
  // opened manually — only ever ADDS the newly-active id to the expanded set.
  //
  // `useState` + compare-during-render rather than a ref: this repo's
  // eslint-plugin-react-hooks forbids reading or writing a ref during render
  // (react-hooks/refs). Same idiom as video-gen-focus-view.tsx's openNodeSeed.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(activeVersionId ? [activeVersionId] : []),
  );
  const [seenActiveId, setSeenActiveId] = useState(activeVersionId);
  if (activeVersionId !== seenActiveId) {
    setSeenActiveId(activeVersionId);
    if (activeVersionId && !expandedIds.has(activeVersionId)) {
      setExpandedIds(new Set(expandedIds).add(activeVersionId));
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (total === 0) return null;

  return (
    <div>
      {!hideHeader && (
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <History className="size-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow">History</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {total} generation{total !== 1 ? "s" : ""}
          </span>
        </div>
      )}
      {/* No max-height and no nested scroller: the focus view's middle column already
          owns scrolling, so capping this list only truncated it inside a pane that had
          room to spare. */}
      <div className="pb-2">
        <ul className="space-y-1">
          {rows.map((row, i) => {
            const isActive = row.id === activeVersionId;
            const isError = Boolean(row.error);
            const isExpanded = expandedIds.has(row.id);
            const label = `v${total - i}`;

            return (
              <li key={row.id} className="overflow-hidden rounded-lg border border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleExpanded(row.id)}
                  className={cn(
                    "block h-auto w-full rounded-none border-0 px-3 py-2 text-left font-normal whitespace-normal transition-colors hover:bg-transparent dark:hover:bg-transparent",
                    isActive
                      ? "bg-primary/8"
                      : "cursor-pointer hover:bg-muted dark:hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* A failed generation has no approval state to report — showing
                          the amber "pending" dot would assert it is queued for a reviewer
                          when it produced no output at all. */}
                      {isError ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
                      ) : (
                        <ApprovalStatusIcon status={row.approvalStatus} />
                      )}
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isActive ? "text-primary" : "text-foreground",
                        )}
                      >
                        {label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(row.createdAt)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {row.thumb}
                      {isActive && (
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                          Active
                        </span>
                      )}
                      {isError && (
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-red-500">
                          Error
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          "size-3.5 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180",
                        )}
                        strokeWidth={1.5}
                      />
                    </div>
                  </div>
                </Button>

                {isExpanded && (
                  <div className="border-t border-border px-3 py-2">
                    {row.meta}
                    {row.makerName !== undefined && (
                      <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                        Made by {row.makerName ?? "an unknown maker"}
                      </p>
                    )}

                    {/* D173: the full decision thread replaces the old single
                        latest-decision line — the newest thread entry already IS that
                        line, so showing both would repeat the same information twice. */}
                    <VersionDecisionThread decisions={row.decisions ?? []} />

                    {!isActive && !isError && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={restoring}
                          onClick={() => onRestore(row.id)}
                        >
                          Restore this version
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
