"use client";

import { cn } from "@/lib/utils";
import { History } from "lucide-react";

export type VideoGenVersionSummary = {
  id: string;
  output: string | null; // video URL
  error: string | null;
  modelUsed?: string | null;
  paramsUsed: Record<string, unknown>;
  createdAt: string;
};

type Props = {
  versions: VideoGenVersionSummary[];
  activeVersionId: string | null;
  onRestore: (versionId: string) => void;
  restoring: boolean;
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function VideoGenVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
}: Props) {
  if (versions.length === 0) return null;
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
            const isActive = v.id === activeVersionId;
            const isError = Boolean(v.error);
            const isDisabled = isActive || restoring || isError;
            const label = `v${total - i}`;
            const modelLabel = (v.modelUsed ?? "").split(":")[1] ?? "";

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
                      : isError
                        ? "cursor-not-allowed border-border opacity-60"
                        : "cursor-pointer border-border hover:bg-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          isError
                            ? "bg-red-500"
                            : isActive
                              ? "bg-primary"
                              : "bg-muted-foreground/40",
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isActive ? "text-primary" : "text-foreground",
                        )}
                      >
                        {label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeTime(v.createdAt)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {v.output && (
                        <div className="size-7 overflow-hidden rounded-sm border border-border">
                          <video
                            src={v.output}
                            className="size-full object-cover"
                            muted
                            playsInline
                          />
                        </div>
                      )}
                      {isActive ? (
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                          Active
                        </span>
                      ) : isError ? (
                        <span className="text-xs text-red-500">Error</span>
                      ) : (
                        <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          Restore
                        </span>
                      )}
                    </div>
                  </div>

                  {modelLabel && (
                    <p className="ml-3.5 mt-0.5 line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                      {modelLabel}
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
