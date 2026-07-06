"use client";

import { useMemo } from "react";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { USD_TO_INR } from "@/lib/pricing";
import type { VideoGenVersionSummary } from "./video-gen-version-history";
import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";

type Props = { versions: VideoGenVersionSummary[] };

type GenStat = {
  vNum: number;
  createdAt: string;
  durationSeconds: number;
  costUsd: number;
  costInr: number;
  modelLabel: string;
};

export function VideoGenUsagePopover({ versions }: Props) {
  const { totals, perGen } = useMemo(() => {
    let totalUsd = 0;
    let counted = 0;
    const perGen: GenStat[] = [];

    const ordered = [...versions].reverse();
    ordered.forEach((v, i) => {
      if (!v.output || !v.modelUsed) return;
      // durationSeconds is set by complete.ts for all providers;
      // duration (Veo) and seconds (Sora) are provider-specific fallbacks for older rows.
      const duration = Number(
        v.paramsUsed?.durationSeconds ?? v.paramsUsed?.duration ?? v.paramsUsed?.seconds ?? 5,
      );
      const audio = Boolean(v.paramsUsed?.audio);
      const cost = computeVideoCost(v.modelUsed, duration, audio);
      if (!cost) return;
      totalUsd += cost.usd;
      counted++;
      perGen.push({
        vNum: i + 1,
        createdAt: v.createdAt,
        durationSeconds: duration,
        costUsd: cost.usd,
        costInr: cost.inr,
        modelLabel: v.modelUsed.split(":")[1] ?? v.modelUsed,
      });
    });

    return {
      totals: { totalUsd, totalInr: totalUsd * USD_TO_INR, counted },
      perGen: perGen.reverse(),
    };
  }, [versions]);

  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: formatRelativeTime(g.createdAt),
    meta: `${g.durationSeconds}s · ${g.modelLabel}`,
    costUsd: `$${g.costUsd.toFixed(4)}`,
    costInr: `₹${g.costInr.toFixed(2)}`,
  }));

  return (
    <UsagePopoverShell
      rows={rows}
      totalCostUsd={`$${totals.totalUsd.toFixed(4)}`}
      totalCostInr={`₹${totals.totalInr.toFixed(2)}`}
    />
  );
}
