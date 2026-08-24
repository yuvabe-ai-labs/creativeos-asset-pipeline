"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { describeVersionParams } from "@/lib/generations/version-params";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { VersionDecisionSummary } from "@/lib/approval";
import { ApprovalStatusIcon } from "@/components/review/approval-status-icon";
import { VersionDecisionThread } from "./version-decision-history";

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
  // D173: every decision made on this version, newest first.
  decisions?: VersionDecisionSummary[];
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
  const total = versions.length;
  // versionId → "vN" label, so an edit can name the version it was derived from.
  const labelById = new Map(versions.map((v, i) => [v.id, `v${total - i}`]));

  // D176: the active version starts expanded; everything else starts collapsed. Tracks
  // activeVersionId changes (e.g. after a restore) without force-collapsing rows the user
  // opened manually — only ever ADDS the newly-active id to the expanded set.
  //
  // Deviation from the task-7 brief's verbatim code: the brief used a `useRef` read/written
  // during render to detect the activeVersionId change, and put the `versions.length === 0`
  // early return BEFORE the hooks. Both fail this repo's actual eslint-plugin-react-hooks
  // (7.1.1, via eslint-config-next): refs can't be read/written during render
  // (react-hooks/refs), and hooks can't follow a conditional return (rules-of-hooks). Swapped
  // the ref for `useState` + compare-during-render — the same "adjusting state when a prop
  // changes" idiom already used elsewhere in this repo (e.g.
  // video-gen-focus-view.tsx's openNodeSeed) — and moved the early return below the hooks.
  // Behavior is unchanged: still only ever ADDS the newly-active id, never removes others.
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

  if (versions.length === 0) return null;

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
      {/* No max-height and no nested scroller: the focus view's middle column already
          owns scrolling, so capping this list only truncated it inside a pane that had
          room to spare. */}
      <div className="pb-2">
        <ul className="space-y-1">
          {versions.map((v, i) => {
            const isActive = v.id === activeVersionId;
            const isError = Boolean(v.error);
            const isExpanded = expandedIds.has(v.id);
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
              <li key={v.id} className="overflow-hidden rounded-lg border border-border">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleExpanded(v.id)}
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
                        <ApprovalStatusIcon status={v.approvalStatus} />
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
                    {modelLabel && (
                      <p className="line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                        {modelLabel}
                      </p>
                    )}

                    {paramSummary && (
                      <p className="mt-0.5 line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground/80">
                        {paramSummary}
                      </p>
                    )}

                    {v.inputsUsed?.baseVersionId && (
                      <p className="mt-0.5 text-[0.65rem] leading-snug text-primary/70">
                        edited from {labelById.get(v.inputsUsed.baseVersionId) ?? "an earlier version"}
                      </p>
                    )}
                    {v.inputsUsed?.instruction && (
                      <p className="mt-0.5 line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
                        “{v.inputsUsed.instruction}”
                      </p>
                    )}
                    {v.makerName !== undefined && (
                      <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground/80">
                        Made by {v.makerName ?? "an unknown maker"}
                      </p>
                    )}

                    {/* D173: the full decision thread replaces the old single
                        latest-decision line — the newest thread entry already IS that
                        line, so showing both would repeat the same information twice. */}
                    <VersionDecisionThread decisions={v.decisions ?? []} />

                    {!isActive && !isError && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={restoring}
                          onClick={() => onRestore(v.id)}
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
