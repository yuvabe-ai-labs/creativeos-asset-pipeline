"use client";

import type { ModelRequestRecord } from "@/lib/nodes/model-request";
import type { VersionDecisionSummary } from "@/lib/approval";
import { VersionList } from "./version-list";
import { VersionThumb } from "./version-thumb";

export type VersionSummary = {
  id: string;
  output: string | null;
  error: string | null;
  modelUsed?: string | null;
  paramsUsed: {
    instruction?: string;
    tokensUsed?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  };
  createdAt: string;
  decision: "pass" | "fail" | null;
  note: string | null;
  // D29 approval flag (distinct from decision).
  approvalStatus?: "pending" | "approved" | "changes_requested";
  approvedAt?: string | null;
  // R11.3/R11.4: resolved display names, else the legacy fallback, else null (D168).
  makerName?: string | null;
  approvedByName?: string | null;
  // D173: every decision made on this version, newest first. Prompt versions are excluded
  // from the review QUEUE (R3.2 — only image/video assets are queued for review), but they
  // can still be approved or rejected directly on the node, and those decisions are logged
  // like any other.
  decisions?: VersionDecisionSummary[];
  // The exact request this version sent to the model (frozen provenance).
  inputsUsed?: { request?: ModelRequestRecord };
  // Real settled credits — null for legacy versions predating the credit system.
  creditsCharged?: number | null;
};

type PromptVersionHistoryProps = {
  versions: VersionSummary[];
  activeVersionId: string | null;
  viewedVersionId: string | null;
  onView: (versionId: string) => void;
};

// D180/D383: renders the same shell (VersionList) as image-gen and video-gen, supplying only
// the model and instruction lines. A prompt version has a text tile for a thumbnail.
export function PromptVersionHistory({
  versions,
  activeVersionId,
  viewedVersionId,
  onView,
}: PromptVersionHistoryProps) {
  const rows = versions.map((v) => ({
    id: v.id,
    createdAt: v.createdAt,
    error: v.error,
    approvalStatus: v.approvalStatus,
    makerName: v.makerName,
    decisions: v.decisions,
    thumb: <VersionThumb kind="text" />,
    summary: v.modelUsed ?? undefined,
    meta: (
      <>
        {v.paramsUsed.instruction && (
          <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-snug text-muted-foreground">
            {v.paramsUsed.instruction}
          </p>
        )}
      </>
    ),
  }));

  return <VersionList rows={rows} activeVersionId={activeVersionId} viewedVersionId={viewedVersionId} onView={onView} />;
}
