import { ArrowRight } from "lucide-react";
import { formatUsd } from "@/lib/ai-models/price-format";
import { percentChipText } from "@/lib/admin/percent-edit";
import type { PriceChange } from "@/lib/admin/change-prices";
import { PercentChip, percentTone } from "@/components/admin/models/percent-chip";

function Chip({ c }: { c: PriceChange }) {
  if (c.newAmount === null) return null;
  if (c.oldAmount === null) return <PercentChip text="New" tone="new" />;
  if (c.same) return <span className="text-xs text-muted-foreground">Same</span>;
  const text = percentChipText(c.percent);
  return text && c.percent !== null ? <PercentChip text={text} tone={percentTone(c.percent)} /> : null;
}

/** Prices before and after, one row each with its change: the review's diff and the replaced change's list. */
export function ChangeRows({ rows, beforeLabel, header = true }: { rows: PriceChange[]; beforeLabel: string; header?: boolean }) {
  return (
    <table className="w-full text-[0.8125rem]">
      {header && (
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Setting</th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">{beforeLabel}</th>
            <th scope="col" className="w-5"><span className="sr-only">to</span></th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">New</th>
            <th scope="col" className="w-16 py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((c) => (
          <tr key={c.key} className="border-b last:border-b-0">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal">{c.name}</th>
            <td className="py-2.5 pr-2 text-right tabular-nums text-muted-foreground">{c.oldAmount === null ? "None" : formatUsd(c.oldAmount)}</td>
            <td className="w-5 text-muted-foreground"><ArrowRight aria-label="to" strokeWidth={1.5} className="size-3.5" /></td>
            <td className="py-2.5 pr-2 text-right font-semibold tabular-nums">{c.newAmount === null ? "Removed" : formatUsd(c.newAmount)}</td>
            <td className="w-16 py-2.5 text-right"><Chip c={c} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
