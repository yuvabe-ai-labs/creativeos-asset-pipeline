import { Info, TriangleAlert, Wallet } from "lucide-react";
import { percentChange, percentChipText } from "@/lib/admin/percent-edit";
import type { Review } from "@/lib/admin/change-prices";
import { PercentChip, percentTone } from "@/components/admin/models/percent-chip";
import { cn } from "@/lib/utils";
import { AgenciesBlock } from "./agencies-block";
import { ChangeRows } from "./change-rows";

const n = (v: number) => v.toLocaleString("en-US");

function TypicalRun({ typical }: { typical: NonNullable<Review["typical"]> }) {
  if (typical.after === null) return null;
  const p = typical.before === null || typical.before === typical.after ? null : percentChange(typical.before, typical.after);
  const text = percentChipText(p);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-[0.8125rem]">
      <Wallet aria-hidden strokeWidth={1.5} className="size-4 text-muted-foreground" />
      <span className="flex-1">
        Typical run <span className="text-muted-foreground">({typical.label})</span>
      </span>
      <span className="flex items-center gap-2 tabular-nums">
        {p !== null && typical.before !== null && <s className="text-muted-foreground decoration-muted-foreground/60">{n(typical.before)}</s>}
        <span className="font-semibold">{n(typical.after)} credits</span>
        {typical.before !== null && typical.before === typical.after && <span className="text-xs text-muted-foreground">no change</span>}
        {text && p !== null && <PercentChip text={text} tone={percentTone(p)} />}
      </span>
    </div>
  );
}

/** Review: what changes and from when, any change it replaces (every price listed), the typical run, notes, and the agencies it reaches. */
export function ReviewStep({ review, label }: { review: Review; label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.8125rem]">
        <span className="font-semibold">{review.countText}</span>, {review.startText}
      </p>
      {review.replaced ? (
        <div className="rounded-xl border border-warning/50 bg-warning/10 px-4 py-3">
          <div className="flex items-start gap-2.5 text-[0.8125rem]">
            <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-warning-text" />
            <p>
              <span className="font-semibold">{review.replaced.title}</span>
              <span className="block">{review.replaced.detail}</span>
            </p>
          </div>
          <div className="mt-2 border-t border-warning/40">
            <ChangeRows rows={review.replaced.rows} beforeLabel="Scheduled" header={false} />
          </div>
        </div>
      ) : (
        <>
          {review.compareText && <p className="text-xs text-muted-foreground">{review.compareText}</p>}
          {review.changes.length ? (
            <ChangeRows rows={review.changes} beforeLabel={review.beforeLabel} />
          ) : (
            <p className="text-[0.8125rem] text-muted-foreground">No prices change.</p>
          )}
        </>
      )}
      {review.typical && <TypicalRun typical={review.typical} />}
      {review.warnings.map((w) => (
        <div
          key={w.text}
          className={cn(
            "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[0.8125rem]",
            w.tone === "warn" ? "border-warning/50 bg-warning/10" : "border-primary/25 bg-primary/5",
          )}
        >
          {w.tone === "warn" ? (
            <TriangleAlert aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-warning-text" />
          ) : (
            <Info aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-primary" />
          )}
          <span>{w.text}</span>
        </div>
      ))}
      <h3 className="mt-3 text-sm font-semibold">Agencies using it</h3>
      <AgenciesBlock label={label} rows={review.agencies} />
    </div>
  );
}
