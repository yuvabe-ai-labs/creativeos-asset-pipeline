"use client";

import { useMemo } from "react";
import { computeImageCost } from "@/lib/image-gen/cost";
import { USD_TO_INR } from "@/lib/pricing";
import type { ImageGenVersionSummary } from "./image-gen-version-history";
import { UsagePopoverShell, type UsageRow, type OverallRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";

type Props = { versions: ImageGenVersionSummary[] };

type GenStat = {
  vNum: number;
  createdAt: string;
  totalTokens: number;
  costUsd: number;
  costInr: number;
  modelId: string;
  hasData: boolean;
};

export function ImageGenUsagePopover({ versions }: Props) {
  const { totals, perGen } = useMemo(() => {
    let totalUsd = 0;
    let totalTokens = 0;
    let displayModel = "";
    let counted = 0;
    const perGen: GenStat[] = [];

    const ordered = [...versions].reverse(); // oldest first → v1, v2, …
    ordered.forEach((v, i) => {
      const tokens = v.paramsUsed?.tokensUsed ?? null;
      const modelId = v.paramsUsed?.modelId ?? v.modelUsed ?? "";
      const cost = tokens ? computeImageCost(modelId, tokens) : null;

      if (modelId && cost) displayModel = modelId.split(":")[1] ?? modelId;
      if (tokens) totalTokens += tokens.total_tokens;
      if (cost) { totalUsd += cost.usd; counted++; }

      perGen.push({
        vNum: i + 1,
        createdAt: v.createdAt,
        totalTokens: tokens?.total_tokens ?? 0,
        costUsd: cost?.usd ?? 0,
        costInr: cost?.inr ?? 0,
        modelId: modelId ? (modelId.split(":")[1] ?? modelId) : "",
        hasData: !!tokens,
      });
    });

    return {
      totals: { totalUsd, totalInr: totalUsd * USD_TO_INR, totalTokens, displayModel, counted },
      perGen: perGen.reverse(), // newest first
    };
  }, [versions]);

  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: formatRelativeTime(g.createdAt),
    meta: g.hasData ? `${g.totalTokens.toLocaleString()} tokens` : undefined,
    costUsd: g.hasData ? `$${g.costUsd.toFixed(4)}` : "—",
    costInr: g.hasData ? `₹${g.costInr.toFixed(2)}` : undefined,
  }));

  const overallRows: OverallRow[] = totals.totalTokens > 0
    ? [{ label: "Total tokens", value: totals.totalTokens.toLocaleString() }]
    : [];

  return (
    <UsagePopoverShell
      rows={rows}
      overallRows={overallRows}
      totalCostUsd={`$${totals.totalUsd.toFixed(4)}`}
      totalCostInr={`₹${totals.totalInr.toFixed(2)}`}
      modelLabel={totals.displayModel || undefined}
    />
  );
}
