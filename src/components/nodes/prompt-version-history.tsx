"use client";

import type { ModelRequestRecord } from "@/lib/nodes/model-request";
import type { VersionDecisionSummary } from "@/lib/approval";
import { VersionHistoryList } from "./version-history-list";

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
  onRestore: (versionId: string) => void;
  restoring: boolean;
};

// D180: was the last node type still on the old flat list — a whole-row restore button, a
// duplicate local relative-time helper, a plain dot instead of the shared status icon, a
// nested max-h-52 scroller, and no decision thread. It now renders the same shell as
// image-gen and video-gen, supplying only the model and instruction lines. A prompt
// version has no thumbnail.
export function PromptVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
}: PromptVersionHistoryProps) {
  const rows = versions.map((v) => ({
    id: v.id,
    createdAt: v.createdAt,
    error: v.error,
    approvalStatus: v.approvalStatus,
    makerName: v.makerName,
    decisions: v.decisions,
    meta: (
      <>
        {v.modelUsed && (
          <p className="line-clamp-1 text-[0.7rem] leading-snug text-muted-foreground">
            {v.modelUsed}
          </p>
        )}
        {v.paramsUsed.instruction && (
          <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-snug text-muted-foreground">
            {v.paramsUsed.instruction}
          </p>
        )}
      </>
    ),
  }));

  return (
    <VersionHistoryList
      rows={rows}
      activeVersionId={activeVersionId}
      onRestore={onRestore}
      restoring={restoring}
    />
  );
}
