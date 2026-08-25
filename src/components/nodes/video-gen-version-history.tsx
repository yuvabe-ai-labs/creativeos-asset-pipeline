"use client";

import type { ApprovalStatus, VersionDecisionSummary } from "@/lib/approval";
import { describeVersionParams } from "@/lib/generations/version-params";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { VersionHistoryList } from "./version-history-list";

export type VideoGenVersionSummary = {
  id: string;
  output: string | null; // video URL
  error: string | null;
  modelUsed?: string | null;
  paramsUsed: Record<string, unknown>;
  createdAt: string;
  // Real settled credits — null for legacy versions predating the credit system.
  creditsCharged?: number | null;
  // D29 approval flag. The versions API has always returned these; video was the one
  // node type with no control able to act on them (R10.1).
  approvalStatus?: ApprovalStatus;
  note?: string | null;
  // R11.3/R11.4: resolved display names, else null (D168).
  makerName?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  // D173: every decision made on this version, newest first.
  decisions?: VersionDecisionSummary[];
};

type Props = {
  versions: VideoGenVersionSummary[];
  activeVersionId: string | null;
  onRestore: (versionId: string) => void;
  restoring: boolean;
  hideHeader?: boolean;
};

// D180: the row shell (collapse/expand, status icon, error state, maker, decision thread,
// restore) lives in VersionHistoryList. This file supplies only what is specific to a
// video version: the thumbnail and the generation metadata.
export function VideoGenVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
  hideHeader = false,
}: Props) {
  const rows = versions.map((v) => {
    const modelLabel = (v.modelUsed ?? "").split(":")[1] ?? "";
    // YUV-295: what this version was actually generated with. Without it two rows for the
    // same shot are indistinguishable — and since restoring one now also restores its
    // model and params, the row has to show what restoring would apply.
    const paramSummary = describeVersionParams(
      videoGenClientModelMap[v.modelUsed ?? ""]?.params,
      v.paramsUsed,
    )
      .map((p) => `${p.label}: ${p.value}`)
      .join(" · ");

    return {
      id: v.id,
      createdAt: v.createdAt,
      error: v.error,
      approvalStatus: v.approvalStatus,
      makerName: v.makerName,
      decisions: v.decisions,
      thumb: v.output ? (
        <div className="size-7 overflow-hidden rounded-sm border border-border">
          <video src={v.output} className="size-full object-cover" muted playsInline />
        </div>
      ) : undefined,
      meta: (
        <>
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
        </>
      ),
    };
  });

  return (
    <VersionHistoryList
      rows={rows}
      activeVersionId={activeVersionId}
      onRestore={onRestore}
      restoring={restoring}
      hideHeader={hideHeader}
    />
  );
}
