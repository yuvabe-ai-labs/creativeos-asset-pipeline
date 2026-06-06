"use client";

import { Circle, CircleDashed, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KBField, KBFieldStatus } from "@/lib/kb/schema";

type ModuleStatus = "not_started" | "in_progress" | "ready";

export function getModuleStatus(
  fields: Record<string, KBField<unknown>>,
): ModuleStatus {
  const values = Object.values(fields);
  if (values.length === 0) return "not_started";
  const needsReview = values.filter((f) => f.status === "needs_review").length;
  if (needsReview === 0) return "ready";
  if (needsReview === values.length) return "not_started";
  return "in_progress";
}

const STATUS_TITLE: Record<ModuleStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  ready: "Ready",
};

const STATUS_ICON: Record<ModuleStatus, React.ElementType> = {
  not_started: Circle,
  in_progress: CircleDashed,
  ready: CheckCircle2,
};

const STATUS_ICON_CLASSES: Record<ModuleStatus, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-amber-500 dark:text-amber-400",
  ready: "text-emerald-500 dark:text-emerald-400",
};

const PROGRESS_CLASSES: Record<ModuleStatus, string> = {
  not_started: "bg-muted-foreground/30",
  in_progress: "bg-amber-400 dark:bg-amber-500",
  ready: "bg-emerald-500 dark:bg-emerald-400",
};

type Props = {
  label: string;
  fields: Record<string, KBField<unknown>>;
  isSelected: boolean;
  onClick: () => void;
};

export function KBModuleCard({ label, fields, isSelected, onClick }: Props) {
  const status = getModuleStatus(fields);
  const all = Object.values(fields);
  const total = all.length;
  const reviewed = all.filter((f) => f.status !== "needs_review").length;
  const progressPct = total === 0 ? 100 : Math.round((reviewed / total) * 100);
  const Icon = STATUS_ICON[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border px-4 py-3 text-left transition-all",
        "hover:border-foreground/20 hover:bg-muted/40",
        isSelected
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Icon
          className={cn("size-4 shrink-0", STATUS_ICON_CLASSES[status])}
          title={STATUS_TITLE[status]}
          aria-label={STATUS_TITLE[status]}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {total === 0 ? "No data extracted" : `${reviewed} / ${total} fields reviewed`}
      </p>
      {/* Progress bar */}
      <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", PROGRESS_CLASSES[status])}
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </button>
  );
}

export function getStatusCount(fields: Record<string, KBField<unknown>>): {
  needs_review: number;
  approved: number;
  edited: number;
  rejected: number;
} {
  const counts = { needs_review: 0, approved: 0, edited: 0, rejected: 0 };
  for (const f of Object.values(fields)) {
    counts[f.status as KBFieldStatus]++;
  }
  return counts;
}
