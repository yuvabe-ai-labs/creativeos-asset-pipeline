import { cn } from "@/lib/utils";
import { BIG_CHANGE_PERCENT } from "@/lib/admin/percent-edit";

export type PercentTone = "down" | "up" | "big" | "new";

const TONE: Record<PercentTone, string> = {
  down: "bg-success/15 text-success-text",
  up: "bg-warning/20 text-warning-text",
  big: "bg-destructive/10 text-destructive-text",
  new: "bg-primary/10 text-primary",
};

/** The tone of a price change: a drop, a rise, or a change of 50% or more either way. */
export function percentTone(p: number): PercentTone {
  return Math.abs(p) >= BIG_CHANGE_PERCENT - 1e-9 ? "big" : p < 0 ? "down" : "up";
}

/** "−31%" on a price change, wherever one is shown: the models list, the price sheet, Try a run. */
export function PercentChip({ text, tone, className }: { text: string; tone: PercentTone; className?: string }) {
  return (
    <span className={cn("inline-flex h-[18px] items-center rounded-full px-1.5 text-[0.72rem] font-semibold tabular-nums", TONE[tone], className)}>
      {text}
    </span>
  );
}
