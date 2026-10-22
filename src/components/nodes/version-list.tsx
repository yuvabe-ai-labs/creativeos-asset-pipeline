"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { stepVersionId } from "@/lib/versions/viewing";
import { ApprovalStatusIcon } from "@/components/review/approval-status-icon";
import { VersionDecisionThread } from "./version-decision-history";
import { VersionFailedThumb } from "./version-thumb";
import type { ApprovalStatus, VersionDecisionSummary } from "@/lib/approval";

// D180 + D383: ONE version list for every node type. A row click VIEWS the version (the output
// column shows it); restoring happens only in the viewing bar. Each node type supplies only its
// thumbnail, one summary line and its expanded metadata.
export type VersionRow = {
  id: string;
  createdAt: string;
  error: string | null;
  approvalStatus?: ApprovalStatus;
  makerName?: string | null;
  decisions?: VersionDecisionSummary[];
  thumb?: ReactNode;
  /** One line under the label, e.g. the model. */
  summary?: string;
  /** Shown when the row is open (it is the version on screen). */
  meta?: ReactNode;
};

/** The version an arrow key moves to from the open row, or null for other keys and the ends. */
export function arrowKeyTarget(rows: { id: string }[], openId: string | null, key: string): string | null {
  if (key !== "ArrowDown" && key !== "ArrowUp") return null;
  return stepVersionId(rows, openId, key === "ArrowDown" ? 1 : -1);
}

export function VersionList({
  rows,
  activeVersionId,
  viewedVersionId,
  onView,
  hideHeader = false,
}: {
  rows: VersionRow[];
  activeVersionId: string | null;
  viewedVersionId: string | null;
  onView: (id: string) => void;
  hideHeader?: boolean;
}) {
  const total = rows.length;
  if (total === 0) return null;
  // The row on screen: the viewed one, else the active one.
  const openId = viewedVersionId ?? activeVersionId;
  // The tab stop is the open row, else the first, so the list is always reachable by keyboard.
  const tabStopId = rows.some((r) => r.id === openId) ? openId : rows[0].id;

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    // Only a key pressed on a row button steps versions, not one pressed inside the details.
    if (!(e.target as HTMLElement).hasAttribute("data-version-row")) return;
    const next = arrowKeyTarget(rows, openId, e.key);
    if (!next) return;
    e.preventDefault();
    onView(next);
    // Roving focus: the row just opened becomes the tab stop.
    e.currentTarget.querySelectorAll<HTMLElement>("[data-version-row]")[rows.findIndex((r) => r.id === next)]?.focus();
  }

  return (
    <div>
      {!hideHeader && (
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <History className="size-3.5 text-primary" strokeWidth={1.5} />
            <span className="text-eyebrow">History</span>
          </div>
          <span className="text-xs text-muted-foreground">{`${total} generation${total !== 1 ? "s" : ""}`}</span>
        </div>
      )}
      <ul role="listbox" aria-label="Versions" onKeyDown={onKeyDown} className="space-y-1.5 pb-2">
        {rows.map((row, i) => {
          const isActive = row.id === activeVersionId;
          const isOpen = row.id === openId;
          const isError = Boolean(row.error);
          return (
            <li
              key={row.id}
              role="presentation"
              className={cn(
                "overflow-hidden rounded-lg border transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                isOpen ? "border-primary/30 bg-primary/5" : "border-border",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                role="option"
                aria-selected={isOpen}
                tabIndex={row.id === tabStopId ? 0 : -1}
                data-version-row=""
                onClick={() => onView(row.id)}
                className="flex h-auto w-full items-center gap-3 rounded-none border-0 px-2 py-2 text-left font-normal whitespace-normal hover:bg-muted/60 dark:hover:bg-muted/60"
              >
                <span className="flex h-12 w-20 shrink-0 items-center justify-center">
                  {isError ? <VersionFailedThumb /> : row.thumb}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", isOpen ? "text-primary" : "text-foreground")}>{`v${total - i}`}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(row.createdAt)}</span>
                  </span>
                  {row.summary && <span className="truncate text-xs text-muted-foreground">{row.summary}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {isError ? (
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-destructive">Failed</span>
                  ) : (
                    <ApprovalStatusIcon status={row.approvalStatus} />
                  )}
                  {isActive ? (
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">Active</span>
                  ) : isOpen ? (
                    <span className="text-[0.65rem] font-medium text-primary">Viewing</span>
                  ) : null}
                </span>
              </Button>
              {isOpen && (
                <div className="border-t border-border px-3 py-2">
                  {row.meta}
                  {row.makerName !== undefined && (
                    <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                      {`Made by ${row.makerName ?? "an unknown maker"}`}
                    </p>
                  )}
                  <VersionDecisionThread decisions={row.decisions ?? []} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
