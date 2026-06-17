"use client";

import { useMemo } from "react";
import { Coins } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { computeImageCost } from "@/lib/image-gen/cost";
import { USD_TO_INR } from "@/lib/pricing";
import type { ImageGenVersionSummary } from "./image-gen-version-history";

function fmtUsd(n: number) {
  return n < 0.01 ? "< $0.01" : `$${n.toFixed(4)}`;
}
function fmtInr(n: number) {
  return `₹${n.toFixed(2)}`;
}
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type Props = { versions: ImageGenVersionSummary[] };

export function ImageGenUsagePopover({ versions }: Props) {
  const { totalUsd, totalInr, totalTokens, perGen } = useMemo(() => {
    let totalUsd = 0;
    let totalTokens = 0;
    const perGen: Array<{
      label: string;
      usd: number;
      inr: number;
      tokens: number;
      createdAt: string;
      modelId: string;
    }> = [];

    const withCost = [...versions].reverse(); // oldest first → v1, v2, ...
    withCost.forEach((v, i) => {
      const tokens = v.paramsUsed?.tokensUsed;
      if (!tokens) return;
      const modelId = v.paramsUsed?.modelId ?? v.modelUsed ?? "";
      const cost = computeImageCost(modelId, tokens);
      if (!cost) return;
      totalUsd    += cost.usd;
      totalTokens += tokens.total_tokens;
      perGen.push({
        label: `v${i + 1}`,
        usd: cost.usd,
        inr: cost.inr,
        tokens: tokens.total_tokens,
        createdAt: v.createdAt,
        modelId: modelId.split(":")[1] ?? modelId,
      });
    });

    return {
      totalUsd,
      totalInr: totalUsd * USD_TO_INR,
      totalTokens,
      perGen: perGen.reverse(),
    };
  }, [versions]);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Coins className="size-3.5 stroke-[1.5]" />
            <span>{fmtUsd(totalUsd)}</span>
          </button>
        }
      />
      <PopoverContent className="w-72 p-4" align="end">
        <p className="mb-3 text-xs font-semibold text-foreground">Usage</p>

        <div className="mb-3 rounded-md bg-muted/40 p-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total tokens</span>
            <span className="font-medium">{totalTokens.toLocaleString()}</span>
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-muted-foreground">Total cost</span>
            <span className="font-medium">
              {fmtUsd(totalUsd)} · {fmtInr(totalInr)}
            </span>
          </div>
        </div>

        {perGen.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[0.65rem] text-muted-foreground">Per generation</p>
            {perGen.map((g) => (
              <div
                key={g.label}
                className="flex items-start justify-between gap-2 text-[0.65rem]"
              >
                <div>
                  <span className="font-medium text-foreground">{g.label}</span>
                  <span className="ml-1.5 text-muted-foreground">{g.modelId}</span>
                  <div className="text-muted-foreground">{relativeTime(g.createdAt)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium">{fmtUsd(g.usd)}</div>
                  <div className="text-muted-foreground">{fmtInr(g.inr)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
