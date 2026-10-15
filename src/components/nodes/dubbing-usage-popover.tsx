"use client";

import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { useNodeCost } from "@/hooks/use-node-cost";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import type { DubbingVersionSummary } from "@/hooks/use-dubbing-versions";

// Spec §7 — one row per version: its dub plus every lip sync on it, summed by the versions route.
export function DubbingUsagePopover({ versions, nodeId, upstreamNodeIds }: { versions: DubbingVersionSummary[]; nodeId: string; upstreamNodeIds: string[] }) {
  const rows: UsageRow[] = versions.map((v, i) => ({
    label: `v${versions.length - i}`,
    meta: [
      v.dubbing ? `${dubLanguageLabel(v.dubbing.language)} dub` : "Dub",
      v.lipSyncRuns > 0 ? `lip sync ×${v.lipSyncRuns}` : null,
    ].filter(Boolean).join(" · "),
    credits: v.creditsCharged === null ? "—" : v.creditsCharged.toLocaleString(),
    time: formatRelativeTime(v.createdAt),
  }));
  const total = versions.reduce((s, v) => s + (v.creditsCharged ?? 0), 0);
  const pipeline = useNodeCost(nodeId, upstreamNodeIds);
  const hasUpstream = upstreamNodeIds.length > 0;
  return (
    <UsagePopoverShell
      rows={rows}
      totalCredits={`${total.toLocaleString()} credits`}
      pipelineTotalCredits={pipeline !== null && hasUpstream ? `${pipeline.toLocaleString()} credits` : undefined}
      pipelineLoading={hasUpstream && pipeline === null}
    />
  );
}
