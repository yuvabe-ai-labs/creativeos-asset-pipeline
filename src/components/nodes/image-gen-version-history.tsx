"use client";

import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { describeVersionParams } from "@/lib/generations/version-params";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import type { VersionDecisionSummary } from "@/lib/approval";
import { VersionHistoryList } from "./version-history-list";

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

// D180: the row shell (collapse/expand, status icon, error state, maker, decision thread,
// restore) lives in VersionHistoryList. This file supplies only what is specific to an
// image version: the thumbnail and the generation metadata.
export function ImageGenVersionHistory({
  versions,
  activeVersionId,
  onRestore,
  restoring,
}: Props) {
  const total = versions.length;
  // versionId → "vN" label, so an edit can name the version it was derived from.
  const labelById = new Map(versions.map((v, i) => [v.id, `v${total - i}`]));

  const rows = versions.map((v) => {
    const versionModelId = v.paramsUsed?.modelId ?? v.modelUsed ?? "";
    const modelLabel = versionModelId.split(":")[1] ?? "";
    // YUV-295: what this version was actually generated with. Without it two rows for the
    // same prompt are indistinguishable — and since restoring one now also restores its
    // model and params, the row has to show what restoring would apply.
    const paramSummary = describeVersionParams(
      imageGenClientModelMap[versionModelId]?.params,
      v.paramsUsed ?? {},
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.output} alt="" className="size-full object-cover" />
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
    />
  );
}
