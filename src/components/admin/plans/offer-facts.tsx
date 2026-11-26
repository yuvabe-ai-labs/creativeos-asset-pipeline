import { Clock, TriangleAlert } from "lucide-react";
import { AgencyTag } from "@/components/admin/agencies/agency-tag";
import { agenciesLine, olderPriceLines, type OfferView } from "@/lib/admin/plans-page";
import { formatRupees } from "@/lib/billing/pricing";

/** What only Admin sees under the owner's card face: margin and our cost, who is on it and what it
 *  brings in, and agencies still on an older price with how their move to today's price stands. */
export function OfferFacts({ view }: { view: OfferView }) {
  const older = view.plan ? olderPriceLines(view) : [];
  const who = agenciesLine(view);
  return (
    <div className="grid gap-1 border-t border-border px-5 py-2.5 text-[0.8125rem]">
      {view.margin !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AgencyTag tone={view.low ? "warn" : "plain"}>
            {view.low && <TriangleAlert aria-hidden strokeWidth={1.5} className="size-3.5" />}
            {view.margin}% margin
          </AgencyTag>
          {view.costMinor !== null && <span className="text-xs text-muted-foreground tabular-nums">Costs us {formatRupees(view.costMinor)}</span>}
        </div>
      )}
      {view.plan ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>
            {who.main}
            {who.extra && <span className="text-muted-foreground">, {who.extra}</span>}
          </span>
          <span className="tabular-nums">
            {formatRupees(view.monthlyMinor)}
            <span className="text-muted-foreground"> a month</span>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>Bought {view.paidCount === 1 ? "once" : `${view.paidCount.toLocaleString("en-IN")} times`} this month</span>
          <span className="tabular-nums">
            {formatRupees(view.paidMinor)}
            <span className="text-muted-foreground"> with GST</span>
          </span>
        </div>
      )}
      {older.map((line) => (
        <p key={line} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Clock aria-hidden strokeWidth={1.5} className="mt-px size-3.5 shrink-0" />
          {line}
        </p>
      ))}
    </div>
  );
}
