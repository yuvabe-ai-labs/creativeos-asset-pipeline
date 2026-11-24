import Link from "next/link";
import { AddChip } from "@/components/admin/models/add-chip";
import { ModelStatusBadge } from "@/components/admin/models/model-status-badge";
import { PercentChip } from "@/components/admin/models/percent-chip";
import { cn } from "@/lib/utils";
import { modelHref, type ModelListRow } from "@/lib/admin/models-list";

/** Shared by the header and each row so the columns line up; at phone width a row stacks in three lines. */
export const LIST_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 md:grid-cols-[minmax(0,2.2fr)_84px_minmax(0,1.6fr)_minmax(0,1.4fr)_110px_92px] md:gap-4 md:px-5";

function PriceCell({ row }: { row: ModelListRow }) {
  if (row.broken) return <span className="text-xs text-destructive-text">Fails its check</span>;
  if (!row.price) {
    // Above the row's link, so it opens the model page itself rather than the row.
    return (
      <AddChip
        label="Add prices"
        nativeButton={false}
        render={<Link href={modelHref(row.id)} prefetch={false} />}
        className="relative z-10"
      />
    );
  }
  return (
    <>
      <div className="font-semibold tabular-nums">
        {!row.price.single && <span className="font-medium text-muted-foreground">from </span>}
        {row.price.from}
      </div>
      <div className="text-xs text-muted-foreground">{row.price.to}</div>
    </>
  );
}

function TypicalCell({ row }: { row: ModelListRow }) {
  if (row.typical) {
    return (
      <>
        <div className="font-semibold tabular-nums">{row.typical.credits.toLocaleString("en-US")} credits</div>
        <div className="text-xs text-muted-foreground">{row.typical.label}</div>
      </>
    );
  }
  if (row.broken) return null;
  return <span className="text-xs text-muted-foreground">{row.price ? "Charged at cost" : "No price yet"}</span>;
}

function MonthCell({ month }: { month: ModelListRow["month"] }) {
  if (!month) return <span className="text-xs text-muted-foreground">No runs</span>;
  return (
    <>
      <div className="font-semibold tabular-nums">{month.runs.toLocaleString("en-US")} {month.runs === 1 ? "run" : "runs"}</div>
      <div className="text-xs tabular-nums text-muted-foreground">{month.cost}</div>
    </>
  );
}

/** One model in the list. The whole row opens the model page (click, or Enter on its name). */
export function ModelListRowView({ row }: { row: ModelListRow }) {
  return (
    <div
      role="row"
      className={cn(
        LIST_COLUMNS,
        // A retired row reads a step lighter (neutral-900 at 80% stays well above AA); its badge is dashed and muted.
        row.status === "retired" && "text-foreground/80",
        "relative min-h-[60px] items-center border-b py-2.5 text-sm transition-colors duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] last:border-b-0 hover:bg-muted/50 has-[a[data-row-link]:focus-visible]:outline-2 has-[a[data-row-link]:focus-visible]:-outline-offset-2 has-[a[data-row-link]:focus-visible]:outline-ring",
      )}
    >
      <div role="cell" className="min-w-0">
        <Link
          href={modelHref(row.id)}
          prefetch={false}
          data-row-link
          className="block truncate font-semibold outline-none after:absolute after:inset-0"
        >
          {row.label}
        </Link>
        <div className="truncate text-xs text-muted-foreground">{row.provider}</div>
      </div>
      <div role="cell" className="justify-self-end md:justify-self-start">
        <ModelStatusBadge status={row.status} />
      </div>
      <div role="cell" className="col-span-2 min-w-0 md:col-span-1">
        <PriceCell row={row} />
      </div>
      <div role="cell" className="min-w-0">
        <TypicalCell row={row} />
      </div>
      <div role="cell" className="justify-self-end md:justify-self-start">
        {row.next ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <PercentChip text={row.next.chip} tone={row.next.tone} />
            <span className="text-xs text-muted-foreground">{row.next.date}</span>
          </span>
        ) : (
          <span className="hidden text-xs text-muted-foreground md:inline">None</span>
        )}
      </div>
      <div role="cell" className="hidden text-right md:block">
        <MonthCell month={row.month} />
      </div>
    </div>
  );
}
