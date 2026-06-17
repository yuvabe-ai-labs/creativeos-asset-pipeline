"use client";

import { cn } from "@/lib/utils";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { ImageTokenUsage } from "@/lib/image-gen/types";

export type ImageGenVersionSummary = {
  id: string;
  output: string | null;   // image URL
  error: string | null;
  modelUsed?: string | null;
  paramsUsed: {
    modelId?: string;
    tokensUsed?: ImageTokenUsage | null;
  };
  createdAt: string;
  decision: "pass" | "fail" | null;
  note: string | null;
};

type Props = {
  versions: ImageGenVersionSummary[];
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

export function ImageGenVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
}: Props) {
  if (versions.length === 0) return null;
  const total = versions.length;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-eyebrow mb-1">Versions</p>
      <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
        {versions.map((v, i) => {
          const isActive = v.id === activeVersionId;
          const isError  = Boolean(v.error);
          const label    = `v${total - i}`;
          const modelLabel =
            (v.paramsUsed?.modelId ?? v.modelUsed ?? "").split(":")[1] ?? "";

          return (
            <div
              key={v.id}
              className={cn(
                "group relative flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors",
                isActive && "border-primary bg-primary/8 text-foreground",
                !isActive && !isError &&
                  "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
                isError &&
                  "border-destructive/30 bg-destructive/5 text-destructive/70 opacity-60",
              )}
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={cn("font-medium", isActive && "text-primary")}>
                    {label}
                  </span>
                  {v.decision === "pass" && (
                    <ThumbsUp className="size-3 stroke-[1.5] text-emerald-600" />
                  )}
                  {v.decision === "fail" && (
                    <ThumbsDown className="size-3 stroke-[1.5] text-destructive" />
                  )}
                  {isError && (
                    <span className="ml-auto rounded-sm bg-destructive/10 px-1 py-0.5 text-[0.6rem] text-destructive">
                      Error
                    </span>
                  )}
                </div>
                <span className="truncate text-[0.65rem] opacity-70">
                  {modelLabel} · {relativeTime(v.createdAt)}
                </span>
              </div>

              {v.output && (
                <div className="size-8 shrink-0 overflow-hidden rounded-sm border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.output} alt="" className="size-full object-cover" />
                </div>
              )}

              {!isActive && !isError && (
                <button
                  onClick={() => onRestore(v.id)}
                  disabled={restoring}
                  className="absolute right-2 top-2 hidden rounded px-1.5 py-0.5 text-[0.65rem] font-medium text-primary hover:bg-primary/10 group-hover:block disabled:opacity-50"
                >
                  Restore
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
