"use client";

import { useMemo } from "react";
import type { ImageGenVersionSummary } from "./image-gen-version-history";
import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { useNodeCost } from "@/hooks/use-node-cost";

type Props = {
  versions: ImageGenVersionSummary[];
  nodeId: string;
  upstreamNodeIds?: string[];
};

type GenStat = {
  vNum: number;
  createdAt: string;
  creditsCharged: number | null;
};

export function ImageGenUsagePopover({ versions, nodeId, upstreamNodeIds }: Props) {
  const { totalCredits, perGen } = useMemo(() => {
    let totalCredits = 0;
    const perGen: GenStat[] = [];

    const ordered = [...versions].reverse(); // oldest first → v1, v2, …
    ordered.forEach((v, i) => {
      if (v.creditsCharged !== null && v.creditsCharged !== undefined) {
        totalCredits += v.creditsCharged;
      }
      perGen.push({
        vNum: i + 1,
        createdAt: v.createdAt,
        creditsCharged: v.creditsCharged ?? null,
      });
    });

    return { totalCredits, perGen: perGen.reverse() }; // newest first
  }, [versions]);

  const hasUpstream = Boolean(upstreamNodeIds && upstreamNodeIds.length > 0);
  const pipelineTotalCredits = useNodeCost(nodeId, upstreamNodeIds);

  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: formatRelativeTime(g.createdAt),
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
