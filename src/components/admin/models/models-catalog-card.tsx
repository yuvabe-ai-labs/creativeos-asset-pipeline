"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { AddChip } from "@/components/admin/models/add-chip";
import { ModelStatusBadge } from "@/components/admin/models/model-status-badge";
import { Money } from "@/components/admin/models/money";
import { PercentChip } from "@/components/admin/models/percent-chip";
import { formatPriceShort, formatUsd } from "@/lib/ai-models/price-format";
import { changePricesHref, modelHref, type ModelListRow } from "@/lib/admin/models-list";
import { cn } from "@/lib/utils";

const credits = (n: number) => `${n.toLocaleString("en-US")} credits`;
const runs = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "run" : "runs"}`;

function RunLine({ row }: { row: ModelListRow }) {
  if (row.broken) return <span className="text-xs text-destructive-text">Fails its check</span>;
  if (!row.price) return <span className="text-xs text-warning-text">No price yet, so it can&apos;t run.</span>;
  if (row.typical) {
    return (
      <>
        <div className="font-semibold tabular-nums">{credits(row.typical.credits)}</div>
        <div className="text-xs text-muted-foreground max-sm:ml-auto max-sm:max-w-40">{row.typical.label}</div>
      </>
    );
  }
  return (
    <>
      <div className="font-semibold">Charged at cost</div>
      <div className="text-xs text-muted-foreground">what the provider bills</div>
    </>
  );
}

function PriceLine({ price }: { price: ModelListRow["price"] }) {
  if (price?.kind !== "price") return null;
  return (
    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums [grid-area:price] max-sm:mt-1.5">
      Costs us {price.varies && "from "}
      <span className="text-foreground" title={`${formatUsd(price.usd)} ${price.unit}`}>{formatPriceShort(price.usd)}</span> {price.unit}
    </p>
  );
}

function Footer({ row }: { row: ModelListRow }) {
  const add = !row.price && !row.broken;
  const notes = add || row.next || row.changed;
  if (!notes && !row.month) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 border-t border-border/60 pt-2 text-xs [grid-area:foot]">
      {add && <AddChip label="Add prices" nativeButton={false} render={<Link href={changePricesHref(row.id)} prefetch={false} />} />}
      {row.next && (
        <span title={row.next.when} className="inline-flex items-center gap-1.5 rounded-full border bg-card py-px pr-2 pl-1.5 whitespace-nowrap">
          <CalendarDays aria-hidden strokeWidth={1.5} className="size-3.5 text-muted-foreground" />
          <PercentChip text={row.next.chip} tone={row.next.tone} />
          <span className="tabular-nums">
            {row.next.credits !== null ? `${credits(row.next.credits)} from ${row.next.date}` : `from ${row.next.date}`}
          </span>
        </span>
      )}
      {!row.next && row.changed && <span className="text-muted-foreground">Price changed {row.changed}</span>}
      {row.month && (
        <span className="ml-auto text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{runs(row.month.runs)}</span> · <Money usd={row.month.costUsd} />
        </span>
      )}
    </div>
  );
}

/**
 * One model in the catalog: name, provider, credits for a typical run with its settings, what the
 * provider charges us, and a footer only for something different. The name is the link; a click
 * anywhere else on the card opens the model page too. In "What agencies see" it keeps only what
 * agencies see in the picker.
 */
export function ModelsCatalogCard({ row, agency }: { row: ModelListRow; agency: boolean }) {
  const router = useRouter();
  const href = modelHref(row.id);
  const draft = !row.broken && row.status === "draft";
  const badge = !agency && row.status !== "live";

  function open(e: React.MouseEvent<HTMLElement>) {
    // The name and Add prices handle their own clicks; selecting text is not a click to open.
    if ((e.target as Element).closest("a, button") || window.getSelection()?.toString()) return;
    router.push(href);
  }

  return (
    <article
      onClick={open}
      className={cn(
        "relative grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] content-start gap-x-2 rounded-xl border bg-card px-3.5 py-3 text-sm shadow-card",
        "transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
        "[grid-template-areas:'name_tag'_'prov_prov'_'run_run'_'price_price'_'foot_foot']",
        "max-sm:px-3 max-sm:py-2.5 max-sm:[grid-template-areas:'name_run'_'prov_run'_'tag_tag'_'price_price'_'foot_foot'] max-sm:hover:translate-y-0 max-sm:hover:scale-100",
        "has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring",
        row.status === "hidden" && "bg-muted/40 shadow-none",
        draft && "border-dashed border-warning/70 shadow-none",
      )}
    >
      <Link href={href} prefetch={false} data-card-link title={row.label} className="min-w-0 truncate font-semibold outline-none [grid-area:name]">
        {row.label}
      </Link>
      {badge && (
        <span className="[grid-area:tag] max-sm:mt-1.5">
          <ModelStatusBadge status={row.status} />
        </span>
      )}
      <span className="truncate text-xs text-muted-foreground [grid-area:prov]">{row.provider}</span>
      <div className="mt-2.5 min-w-0 [grid-area:run] max-sm:mt-0 max-sm:text-right">
        <RunLine row={row} />
      </div>
      {!agency && <PriceLine price={row.price} />}
      {!agency && <Footer row={row} />}
    </article>
  );
}
