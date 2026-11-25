import { Building2 } from "lucide-react";
import { percentChipText } from "@/lib/admin/percent-edit";
import type { AgencyChange } from "@/lib/admin/change-prices";
import { PercentChip, percentTone } from "@/components/admin/models/percent-chip";

const n = (v: number) => v.toLocaleString("en-US");

/** "Agencies using it": this month's runs and what they come to at the typical run, before and after. */
export function AgenciesBlock({ label, rows }: { label: string; rows: AgencyChange[] }) {
  if (!rows.length) return <p className="text-[0.8125rem] text-muted-foreground">No agency ran {label} this month, so nobody sees a change yet.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1.5">
        {rows.map((a) => {
          const text = percentChipText(a.percent);
          return (
            <li key={a.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 text-[0.8125rem]">
              <span className="flex items-center gap-1.5">
                <Building2 aria-hidden strokeWidth={1.5} className="size-3.5 text-muted-foreground" />
                <span className="font-semibold">{a.name}</span>
                <span className="text-muted-foreground">{n(a.runs)} {a.runs === 1 ? "run" : "runs"} this month</span>
              </span>
              {a.after !== null && (
                <span className="flex items-center gap-1.5 tabular-nums">
                  {a.before === null || a.before === a.after ? (
                    `${n(a.after)} credits${a.before === a.after ? ", no change" : ""}`
                  ) : (
                    <>
                      <span className="text-muted-foreground">about {n(a.before)} →</span>
                      <span className="font-semibold">{n(a.after)} credits</span>
                      {text && a.percent !== null && <PercentChip text={text} tone={percentTone(a.percent)} />}
                    </>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Based on this month&apos;s runs at a typical setting. Agencies see the new credit cost from the start time. Nobody is notified.
      </p>
    </div>
  );
}
