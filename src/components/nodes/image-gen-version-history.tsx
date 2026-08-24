"use client";

import { cn } from "@/lib/utils";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { describeVersionParams } from "@/lib/generations/version-params";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { formatRelativeTime } from "@/lib/format/relative-time";

export type ImageGenVersionSummary = {
  id: string;
  output: string | null;   // image URL
  error: string | null;
  modelUsed?: string | null;
  // The raw `node_versions.params_used` record: the model's own params plus the pipeline's
  // bookkeeping. `modelId`/`tokensUsed` are called out because callers read them by name;
  // everything else is read through the model's param specs (lib/generations/version-params).
  paramsUsed: Record<string, unknown> & {
    modelId?: string;
    tokensUsed?: ImageTokenUsage | null;
  };
  createdAt: string;
  decision: "pass" | "fail" | null;
  note: string | null;
  // D29 approval flag (distinct from decision).
  approvalStatus?: "pending" | "approved" | "changes_requested";
  // R11.3/R11.4: resolved display names, else the legacy fallback, else null (D168).
  makerName?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  inputsUsed?: {
    baseVersionId?: string | null;
    instruction?: string;
    intent?: string;
  };
  // Real settled credits — null for legacy versions predating the credit system.
  creditsCharged?: number | null;
};

type Props = {
  versions: ImageGenVersionSummary[];
  activeVersionId: string | null;
  onRestore: (versionId: string) => void;
  restoring: boolean;
};

export function ImageGenVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
}: Props) {
  if (versions.length === 0) return null;
  const total = versions.length;
  // versionId → "vN" label, so an edit can name the version it was derived from.
  const labelById = new Map(versions.map((v, i) => [v.id, `v${total - i}`]));

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
            const isError  = Boolean(v.error);
            const isDisabled = isActive || restoring || isError;
            const label = `v${total - i}`;
            const versionModelId = v.paramsUsed?.modelId ?? v.modelUsed ?? "";
            const modelLabel = versionModelId.split(":")[1] ?? "";
            // YUV-295: what this version was actually generated with. Without it two rows for
            // the same prompt are indistinguishable — and since restoring one now also restores
            // its model and params, the row has to show what restoring would apply.
            const paramSummary = describeVersionParams(
              imageGenClientModelMap[versionModelId]?.params,
              v.paramsUsed ?? {},
            )
              .map((p) => `${p.label}: ${p.value}`)
              .join(" · ");

            return (
              <li key={v.id}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && onRestore(v.id)}
                  className={cn(
                    "group block h-auto w-full rounded-lg border px-3 py-2 text-left font-normal whitespace-normal transition-colors hover:bg-transparent dark:hover:bg-transparent disabled:pointer-events-auto disabled:opacity-100",
                    isActive
                      ? "border-primary bg-primary/8 cursor-default"
                      : isError
                        ? "cursor-not-allowed border-border opacity-60 disabled:opacity-60"
                        : "cursor-pointer border-border hover:bg-muted dark:hover:bg-muted",
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
                        {formatRelativeTime(v.createdAt)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {v.output && (
                        <div className="size-7 overflow-hidden rounded-sm border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={v.output} alt="" className="size-full object-cover" />
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

                  {paramSummary && (
                    <p className="ml-3.5 mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground/80">
                      {paramSummary}
                    </p>
                  )}

                  {v.inputsUsed?.baseVersionId && (
                    <p className="ml-3.5 mt-0.5 text-[0.65rem] leading-snug text-primary/70">
                      edited from {labelById.get(v.inputsUsed.baseVersionId) ?? "an earlier version"}
                    </p>
                  )}
                  {v.inputsUsed?.instruction && (
                    <p className="ml-3.5 mt-0.5 line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                      “{v.inputsUsed.instruction}”
                    </p>
                  )}
                  {v.makerName !== undefined && (
                    <p className="ml-3.5 mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                      Made by {v.makerName ?? "an unknown maker"}
                      {v.approvalStatus === "approved" && v.approvedByName && (
                        <> · Approved by {v.approvedByName} · {formatRelativeTime(v.approvedAt ?? null)}</>
                      )}
                    </p>
                  )}
                  {v.approvalStatus === "changes_requested" && v.approvedByName && v.note && (
                    <p className="ml-3.5 mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-destructive/80">
                      {v.approvedByName} requested changes: {v.note}
                    </p>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
