import { creditNumber, type CreditRunRow } from "@/lib/admin/credits-page";
import { percentChipText } from "@/lib/admin/percent-edit";
import { PercentChip, percentTone } from "@/components/admin/models/percent-chip";

/** Three example runs in plain words, each with its credits now and with the new settings. */
export function CreditExampleRuns({ rows }: { rows: CreditRunRow[] }) {
  if (!rows.length) return <p className="text-[0.8125rem] text-muted-foreground">No typical run has a price yet.</p>;
  return (
    <ul aria-live="polite" className="overflow-hidden rounded-xl border">
      {rows.map((r) => {
        const after = r.after ?? r.before;
        const chip = percentChipText(r.percent);
        return (
          <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-3 py-2.5 text-[0.8125rem] last:border-b-0">
            <span>
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground">, {r.label.charAt(0).toLowerCase() + r.label.slice(1)}</span>
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              {after === r.before ? (
                <>
                  {creditNumber(after)} credits
                  <span className="text-xs text-muted-foreground">No change</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">{creditNumber(r.before)} →</span>
                  <span className="font-semibold">{creditNumber(after)} credits</span>
                  {chip && r.percent !== null && <PercentChip text={chip} tone={percentTone(r.percent)} />}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
