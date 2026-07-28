"use client";

import { useMemo } from "react";
import type { VideoGenVersionSummary } from "./video-gen-version-history";
import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { useNodeCost } from "@/hooks/use-node-cost";

type Props = {
  versions: VideoGenVersionSummary[];
  nodeId: string;
  upstreamNodeIds?: string[];
};

type GenStat = {
  vNum: number;
  createdAt: string;
  durationSeconds: number;
  creditsCharged: number | null;
  modelLabel: string;
};

export function VideoGenUsagePopover({ versions, nodeId, upstreamNodeIds }: Props) {
  const { totalCredits, perGen } = useMemo(() => {
    let totalCredits = 0;
    const perGen: GenStat[] = [];

    const ordered = [...versions].reverse();
    ordered.forEach((v, i) => {
      if (!v.output || !v.modelUsed) return;
      const duration = Number(
        v.paramsUsed?.durationSeconds ?? v.paramsUsed?.duration ?? v.paramsUsed?.seconds ?? 5,
      );
      if (v.creditsCharged !== null && v.creditsCharged !== undefined) {
        totalCredits += v.creditsCharged;
      }
      perGen.push({
        vNum: i + 1,
        createdAt: v.createdAt,
        durationSeconds: duration,
        creditsCharged: v.creditsCharged ?? null,
        modelLabel: v.modelUsed.split(":")[1] ?? v.modelUsed,
      });
    });

    return { totalCredits, perGen: perGen.reverse() };
  }, [versions]);

  const hasUpstream = Boolean(upstreamNodeIds && upstreamNodeIds.length > 0);
  const pipelineTotalCredits = useNodeCost(nodeId, upstreamNodeIds);

  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: formatRelativeTime(g.createdAt),
    meta: `${g.durationSeconds}s · ${g.modelLabel}`,
    credits: g.creditsCharged !== null ? g.creditsCharged.toLocaleString() : "—",
  }));

  return (
    <UsagePopoverShell
      rows={rows}
      totalCredits={`${totalCredits.toLocaleString()} credits`}
      pipelineTotalCredits={
        pipelineTotalCredits !== null && hasUpstream
          ? `${pipelineTotalCredits.toLocaleString()} credits`
          : undefined
      }
      pipelineLoading={hasUpstream && pipelineTotalCredits === null}
    />
  );
}
