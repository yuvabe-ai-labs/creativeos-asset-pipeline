import { formatUsd, formatUsdShort } from "@/lib/ai-models/price-format";
import { cn } from "@/lib/utils";

/** Money rounded for reading ("$15.16", "<$0.01"), with the exact amount on hover. */
export function Money({ usd, className }: { usd: number; className?: string }) {
  const short = formatUsdShort(usd);
  const exact = formatUsd(usd);
  return (
    <span title={exact === short ? undefined : exact} className={cn("tabular-nums", className)}>
      {short}
    </span>
  );
}
