"use client";

import { useMemo } from "react";
import { computeCost } from "@/lib/pricing";
import type { VersionSummary } from "./prompt-version-history";
import { UsagePopoverShell, type UsageRow, type OverallRow } from "./usage-popover-shell";
import { formatRelativeTime } from "@/lib/format/relative-time";

type Props = { versions: VersionSummary[] };

type GenStat = {
  vNum: number;
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costInr: number;
};

export function UsagePopover({ versions }: Props) {
  const { totals, perGen } = useMemo(() => {
    let inputTokens = 0, outputTokens = 0, totalTokens = 0;
    let costUsd = 0, costInr = 0;
    let displayModel = "";
    let counted = 0;
    const perGen: GenStat[] = [];

    versions.forEach((v, i) => {
      const t = v.paramsUsed?.tokensUsed;
      if (!t) return;
      const cost = computeCost(v.modelUsed ?? "", t);
      const raw = v.modelUsed ?? "";
      if (raw) displayModel = raw.includes(":") ? (raw.split(":")[1] ?? raw) : raw;
      inputTokens  += t.prompt_tokens;
      outputTokens += t.completion_tokens;
      totalTokens  += t.total_tokens;
      if (cost) { costUsd += cost.usd; costInr += cost.inr; }
      counted++;
      perGen.push({
        vNum: versions.length - i,
        createdAt: v.createdAt,
        inputTokens: t.prompt_tokens,
        outputTokens: t.completion_tokens,
        costUsd: cost?.usd ?? 0,
        costInr: cost?.inr ?? 0,
      });
    });

    return { totals: { inputTokens, outputTokens, totalTokens, costUsd, costInr, displayModel, counted }, perGen };
  }, [versions]);

  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: formatRelativeTime(g.createdAt),
    meta: `${g.inputTokens.toLocaleString()} in · ${g.outputTokens.toLocaleString()} out`,
    costUsd: `$${g.costUsd.toFixed(4)}`,
    costInr: `₹${g.costInr.toFixed(2)}`,
  }));


  const overallRows: OverallRow[] = [
    { label: "Input tokens",  value: totals.inputTokens.toLocaleString()  },
    { label: "Output tokens", value: totals.outputTokens.toLocaleString() },
    { label: "Total tokens",  value: totals.totalTokens.toLocaleString()  },
  ];

  return (
    <UsagePopoverShell
      rows={rows}
      overallRows={overallRows}
      totalCostUsd={`$${totals.costUsd.toFixed(4)}`}
      totalCostInr={`₹${totals.costInr.toFixed(2)}`}
    />
  );
}
