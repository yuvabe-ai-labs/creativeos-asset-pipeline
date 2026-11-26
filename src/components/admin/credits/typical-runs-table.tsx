import { Info } from "lucide-react";
import { creditNumber, type CreditRunRow } from "@/lib/admin/credits-page";
import { percentChipText } from "@/lib/admin/percent-edit";
import { PercentChip, percentTone } from "@/components/admin/models/percent-chip";
import { cn } from "@/lib/utils";

// Narrow screens put the number's name beside it; wide screens have the column heads instead.
const Lab = ({ children }: { children: string }) => <span className="text-muted-foreground md:sr-only">{children} </span>;

/**
 * Typical runs in credits: what we pay and the credits, or with new settings the credits now, new
 * and the change. A note under a run where rounding adds 15% or more, or where it is charged flat.
 */
export function TypicalRunsTable({ rows }: { rows: CreditRunRow[] }) {
  const compare = rows.some((r) => r.after !== null);
  const nums = compare ? "md:grid-cols-[90px_60px_60px_80px]" : "md:grid-cols-[100px_110px]";
  return (
    <div className="flex flex-col">
      <div aria-hidden className="hidden items-end gap-4 border-b pb-2 text-xs text-muted-foreground md:flex">
        <span className="flex-1">Typical run</span>
        <span className={cn("grid gap-3 text-right", nums)}>
          <span>We pay</span>
          {compare ? (
            <>
              <span>Now</span>
              <span>New</span>
              <span>Change</span>
            </>
          ) : (
            <span>Credits</span>
          )}
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const chip = percentChipText(r.percent);
          return (
            <li key={r.key} className="flex flex-col gap-1.5 border-b py-3 last:border-b-0 md:flex-row md:flex-wrap md:items-start md:gap-x-4">
              <div className="flex-1">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.label}</p>
              </div>
              <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] tabular-nums md:grid md:text-right", nums)}>
                <span className="text-muted-foreground"><Lab>We pay</Lab>{r.usd}</span>
                {r.after !== null ? (
                  <>
                    <span className={cn(r.after !== r.before && "text-muted-foreground")}><Lab>Now</Lab>{creditNumber(r.before)}</span>
                    <span className="font-semibold"><Lab>New</Lab>{creditNumber(r.after)}</span>
                    <span>
                      {chip && r.percent !== null ? <PercentChip text={chip} tone={percentTone(r.percent)} /> : <span className="text-xs text-muted-foreground">No change</span>}
                    </span>
                  </>
                ) : (
                  <span className="font-semibold">{creditNumber(r.before)} credits</span>
                )}
              </div>
              {r.note && (
                <p
                  className={cn(
                    "flex w-fit items-start gap-1.5 rounded-lg px-2 py-1 text-xs md:basis-full",
                    r.note.tone === "rounding" ? "bg-warning/10 text-warning-text" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Info aria-hidden strokeWidth={1.5} className="mt-px size-3.5 shrink-0" />
                  {r.note.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
