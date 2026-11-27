"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NeedsALookCard } from "@/components/admin/models/needs-a-look-card";
import { ModelsCatalogRetired } from "@/components/admin/models/models-catalog-retired";
import { ModelsCatalogSection } from "@/components/admin/models/models-catalog-section";
import { ModelsCatalogToolbar } from "@/components/admin/models/models-catalog-toolbar";
import { buildCatalog, type CatalogOrder, type CatalogView } from "@/lib/admin/models-catalog";
import type { AttentionItem, ModelListRow } from "@/lib/admin/models-list";

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select, [role='textbox']") !== null);

/**
 * The models catalog (D591): Needs a look, the toolbar, one section of cards per kind and the
 * folded retired list. Everything is in `rows`; search and the switches work in the browser.
 */
export function ModelsCatalog({ rows, attention }: { rows: ModelListRow[]; attention: AttentionItem[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CatalogView>("all");
  const [order, setOrder] = useState<CatalogOrder>("picker");
  const [kind, setKind] = useState("all");
  const [retiredOpen, setRetiredOpen] = useState(false);
  // A search opens the retired list; folding it again holds until the search is cleared.
  const [retiredShut, setRetiredShut] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  const catalog = useMemo(() => buildCatalog(rows, { query, view, order }), [rows, query, view, order]);
  const searching = query.trim() !== "";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      search.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // A kind tab shows only that kind's section; "all" shows every section and the retired list.
  const sections = kind === "all" ? catalog.sections : catalog.sections.filter((s) => s.slug === kind);

  function changeQuery(q: string) {
    setQuery(q);
    if (!q.trim()) setRetiredShut(false);
  }

  function clear() {
    changeQuery("");
    search.current?.focus();
  }

  return (
    <div>
      {catalog.needs && <NeedsALookCard items={attention} />}
      <ModelsCatalogToolbar
        searchRef={search}
        query={query}
        onQueryChange={changeQuery}
        chips={catalog.chips}
        kind={kind}
        onKindChange={setKind}
        view={view}
        onViewChange={setView}
        order={order}
        onOrderChange={setOrder}
      />
      {view === "agency" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0" />
          Live models only, in the order agencies see them in the picker, with the credits they pay.
        </p>
      )}
      {sections.map((s) => (
        <ModelsCatalogSection key={s.slug} section={s} agency={view === "agency"} />
      ))}
      {kind === "all" && catalog.retired.length > 0 && (
        <ModelsCatalogRetired
          rows={catalog.retired}
          open={searching ? !retiredShut : retiredOpen}
          onToggle={() => (searching ? setRetiredShut((s) => !s) : setRetiredOpen((o) => !o))}
        />
      )}
      {catalog.empty && (
        <div className="mt-5 flex flex-col items-center gap-2.5 rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-card">
          <p>{searching ? `No models match "${query.trim()}".` : "No models to show."}</p>
          {searching && (
            <Button variant="outline" size="sm" onClick={clear}>
              Clear search
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
