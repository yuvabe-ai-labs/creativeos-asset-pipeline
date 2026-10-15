"use client";

import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { useNodeCost } from "@/hooks/use-node-cost";
import { dubLanguageLabel, dubStyleLabel } from "@/lib/dubbing/types";
import type { DubbingVersionSummary } from "@/hooks/use-dubbing-versions";

// Spec §7 — the Dubbing focus view's usage popover, in the header like Video Gen's and Image Gen's.
// One row per version: its dub plus every lip sync on it, summed by the versions route. It reads the
// versions the view already loaded, so it adds no request.
export function DubbingUsagePopover({ versions, nodeId, upstreamNodeIds }: {
  versions: DubbingVersionSummary[];
  nodeId: string;
  upstreamNodeIds?: string[];
}) {
  const rows: UsageRow[] = versions.map((v, i) => ({
    label: `v${versions.length - i}`,
    meta: [
      v.dubbing ? `${dubLanguageLabel(v.dubbing.language)} dub` : "Dub",
      v.dubbing?.style ? dubStyleLabel(v.dubbing.style) : null,
      v.lipSyncRuns > 0 ? `lip sync ×${v.lipSyncRuns}` : null,
    ].filter(Boolean).join(" · "),
    credits: v.creditsCharged === null ? "—" : v.creditsCharged.toLocaleString(),
    time: formatRelativeTime(v.createdAt),
  }));
  const total = versions.reduce((s, v) => s + (v.creditsCharged ?? 0), 0);
  const hasUpstream = Boolean(upstreamNodeIds && upstreamNodeIds.length > 0);
  const pipeline = useNodeCost(nodeId, upstreamNodeIds);
  return (
    <UsagePopoverShell
      rows={rows}
      totalCredits={`${total.toLocaleString()} credits`}
      pipelineTotalCredits={hasUpstream && pipeline !== null ? `${pipeline.toLocaleString()} credits` : undefined}
      pipelineLoading={hasUpstream && pipeline === null}
    />
  );
}
