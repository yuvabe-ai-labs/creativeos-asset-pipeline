"use client";

import { useState } from "react";
import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { useNodeCost } from "@/hooks/use-node-cost";
import { useNodeVersions } from "@/hooks/queries/node-versions";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import type { DubbingVersionSummary } from "@/hooks/use-dubbing-versions";

// Spec §7 — the Dubbing card's credits footer opens this: one row per version, its dub plus every
// lip sync on it, summed by the versions route. A card makes no request of its own (performance
// rule 1), so the versions load, and the wired video is looked up, only once the popover opens.
export function DubbingUsagePopover({ nodeId }: { nodeId: string }) {
  const [opened, setOpened] = useState(false);
  const versionsQuery = useNodeVersions<DubbingVersionSummary>(nodeId, opened);
  const versions = versionsQuery.data?.versions ?? [];
  const sourceId = useCanvasStore((s) => (opened ? s.edges.find((e) => e.target === nodeId)?.source ?? null : null));
  const upstreamNodeIds = sourceId ? [sourceId] : undefined;
  const pipeline = useNodeCost(nodeId, upstreamNodeIds);
  const own = useNodeCost(nodeId);

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
  const hasUpstream = Boolean(upstreamNodeIds);
  return (
    <UsagePopoverShell
      onOpenChange={(next) => { if (next) setOpened(true); }}
      rows={rows}
      totalCredits={`${(own ?? total).toLocaleString()} credits`}
      pipelineTotalCredits={pipeline !== null && hasUpstream ? `${pipeline.toLocaleString()} credits` : undefined}
      pipelineLoading={opened && (versionsQuery.isPending || (hasUpstream && pipeline === null))}
    />
  );
}
