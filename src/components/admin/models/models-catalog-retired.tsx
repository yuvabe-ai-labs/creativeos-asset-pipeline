import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modelHref, type ModelListRow } from "@/lib/admin/models-list";
import { cn } from "@/lib/utils";

/** Retired models, folded at the end of the catalog: one short row each, opening the model page. */
export function ModelsCatalogRetired({ rows, open, onToggle }: { rows: ModelListRow[]; open: boolean; onToggle: () => void }) {
  return (
    <section aria-label="Retired models" className="mt-7 overflow-hidden rounded-xl border bg-card shadow-card">
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-controls="retired-models"
        onClick={onToggle}
        className="h-auto w-full flex-wrap justify-start gap-x-2 gap-y-0.5 rounded-none px-4 py-3 text-sm font-semibold"
      >
        Retired <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">Agencies can&apos;t pick these</span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.5}
          className={cn("text-muted-foreground transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]", open && "rotate-180")}
        />
      </Button>
      {open && (
        <ul id="retired-models">
          {rows.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-border/60 px-4 py-2 text-xs sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <Link
                href={modelHref(r.id)}
                prefetch={false}
                className="truncate rounded-sm text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {r.label}
              </Link>
              <span className="truncate text-muted-foreground max-sm:hidden">{r.provider}</span>
              <span className="text-muted-foreground">{r.group}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
