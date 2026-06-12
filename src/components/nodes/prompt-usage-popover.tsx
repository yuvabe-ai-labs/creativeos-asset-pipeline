"use client";

import { useMemo } from "react";
import { ReceiptText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { computeCost } from "@/lib/pricing";
import type { VersionSummary } from "./prompt-version-history";

type Props = { versions: VersionSummary[] };

type GenStat = {
  vNum: number;
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costInr: number;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function relativeTime(dateStr: string): string {
  const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const h = Math.floor(diffMins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

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

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ReceiptText className="size-3.5" />
            Usage
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 p-4">
        {totals.counted === 0 ? (
          <p className="text-xs text-muted-foreground">No usage data yet.</p>
        ) : (
          <div className="space-y-4">
            {/* Overall */}
            <div className="space-y-2">
              <p className="text-eyebrow">Overall</p>
              <div className="space-y-1.5">
                <Row label="Input tokens"  value={totals.inputTokens.toLocaleString()}  />
                <Row label="Output tokens" value={totals.outputTokens.toLocaleString()} />
                <Row label="Total tokens"  value={totals.totalTokens.toLocaleString()}  />
              </div>
              <div className="pt-0.5">
                {totals.displayModel && (
                  <p className="mb-0.5 text-[0.6rem] text-muted-foreground">{totals.displayModel}</p>
                )}
                <p className="text-sm font-semibold text-foreground">
                  ${totals.costUsd.toFixed(4)}{" "}
                  <span className="font-normal text-muted-foreground">(₹{totals.costInr.toFixed(2)})</span>
                </p>
              </div>
            </div>

            {/* Per-generation */}
            {perGen.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-eyebrow">Per generation</p>
                <ul className="space-y-2">
                  {perGen.map((g) => (
                    <li key={g.vNum} className="rounded-md bg-muted/50 px-2.5 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">v{g.vNum}</span>
                        <span className="text-[0.65rem] text-muted-foreground">{relativeTime(g.createdAt)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                          {g.inputTokens.toLocaleString()} in · {g.outputTokens.toLocaleString()} out
                        </span>
                        <span className="text-[0.65rem] font-medium tabular-nums text-foreground">
                          ${g.costUsd.toFixed(4)}{" "}
                          <span className="font-normal text-muted-foreground">(₹{g.costInr.toFixed(2)})</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
