"use client";

import { useMemo } from "react";
import { ReceiptText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { USD_TO_INR } from "@/lib/pricing";
import type { VideoGenVersionSummary } from "./video-gen-version-history";

function relativeTime(dateStr: string): string {
  const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const h = Math.floor(diffMins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

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
      const duration = Number(v.paramsUsed?.durationSeconds ?? 5);
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

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ReceiptText className="size-3.5" strokeWidth={1.5} />
            Usage
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 p-4">
        {totals.counted === 0 ? (
          <p className="text-xs text-muted-foreground">No usage data yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-eyebrow">Overall</p>
              <p className="text-sm font-semibold text-foreground">
                ${totals.totalUsd.toFixed(4)}{" "}
                <span className="font-normal text-muted-foreground">(₹{totals.totalInr.toFixed(2)})</span>
              </p>
            </div>

            {perGen.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-eyebrow">Per generation</p>
                <ul className="space-y-2">
                  {perGen.map((g) => (
                    <li key={g.vNum} className="rounded-md bg-muted/50 px-2.5 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">v{g.vNum}</span>
                        <span className="text-[0.65rem] text-muted-foreground">
                          {relativeTime(g.createdAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                          {g.durationSeconds}s · {g.modelLabel}
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
