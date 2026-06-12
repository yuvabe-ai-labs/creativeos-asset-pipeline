"use client";

import { History } from "lucide-react";
import { cn } from "@/lib/utils";

export type VersionSummary = {
  id: string;
  output: string | null;
  error: string | null;
  paramsUsed: { instruction?: string };
  createdAt: string;
};

type PromptVersionHistoryProps = {
  versions: VersionSummary[];
  activeVersionId: string | null;
  onRestore: (versionId: string) => void;
  restoring: boolean;
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PromptVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
}: PromptVersionHistoryProps) {
  const total = versions.length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">History</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {total} generation{total !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="max-h-52 overflow-y-auto pb-2">
      <ul className="space-y-1">
        {versions.map((v, i) => {
          const genNumber = total - i;
          const isActive = v.id === activeVersionId;
          const hasError = !!v.error;
          const isDisabled = isActive || restoring || hasError;

          return (
            <li key={v.id}>
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && onRestore(v.id)}
                className={cn(
                  "group w-full rounded-lg border px-3 py-2 text-left transition-colors",
                  isActive
                    ? "border-primary bg-primary/8 cursor-default"
                    : hasError
                      ? "cursor-not-allowed border-border opacity-60"
                      : "cursor-pointer border-border hover:bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        hasError
                          ? "bg-red-500"
                          : isActive
                            ? "bg-primary"
                            : "bg-muted-foreground/40",
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        isActive ? "text-primary" : "text-foreground",
                      )}
                    >
                      v{genNumber}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(v.createdAt)}
                    </span>
                  </div>

                  {isActive ? (
                    <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                      Active
                    </span>
                  ) : hasError ? (
                    <span className="shrink-0 text-xs text-red-500">Error</span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      Restore
                    </span>
                  )}
                </div>

                {v.paramsUsed.instruction && (
                  <p className="ml-3.5 mt-0.5 line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                    {v.paramsUsed.instruction}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      </div>
    </div>
  );
}
