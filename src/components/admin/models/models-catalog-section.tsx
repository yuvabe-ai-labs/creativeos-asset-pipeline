import { KindOrderPopover } from "@/components/admin/models/kind-order-popover";
import { ModelsCatalogCard } from "@/components/admin/models/models-catalog-card";
import { Money } from "@/components/admin/models/money";
import { headingId, sectionId, type KindSection } from "@/lib/admin/models-catalog";

const runs = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "run" : "runs"}`;

/** One kind in the catalog: its heading, one-line summary, "Picker order", and its models as cards. */
export function ModelsCatalogSection({ section, agency }: { section: KindSection; agency: boolean }) {
  const { slug, group, summary, pickers, rows } = section;
  return (
    <section id={sectionId(slug)} aria-labelledby={headingId(slug)} className="mt-7 scroll-mt-6">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {/* Focusable so a kind chip can move focus here. */}
        <h2
          id={headingId(slug)}
          tabIndex={-1}
          className="rounded-sm font-display text-lg font-semibold tracking-tight outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {group}
        </h2>
        <p className="text-xs text-muted-foreground">
          {summary.counts}
          {summary.month && (
            <>
              {" · "}
              <span className="font-medium text-foreground tabular-nums">{runs(summary.month.runs)}</span>
              {" · "}
              <Money usd={summary.month.costUsd} className="font-medium text-foreground" /> this month
            </>
          )}
        </p>
        <span className="flex-1" />
        {pickers.length > 0 && <KindOrderPopover group={group} pickers={pickers} />}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(218px,1fr))] sm:gap-3">
        {rows.map((row) => (
          <ModelsCatalogCard key={row.id} row={row} agency={agency} />
        ))}
      </div>
    </section>
  );
}
