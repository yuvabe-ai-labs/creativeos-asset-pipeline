"use client";

import { Search, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { COUNT_TABS_LIST, CountTabTrigger } from "@/components/shared/count-tab-trigger";
import type { Catalog, CatalogOrder, CatalogView } from "@/lib/admin/models-catalog";

type Props = {
  searchRef: React.Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (q: string) => void;
  chips: Catalog["chips"];
  kind: string;
  onKindChange: (slug: string) => void;
  view: CatalogView;
  onViewChange: (v: CatalogView) => void;
  order: CatalogOrder;
  onOrderChange: (o: CatalogOrder) => void;
};

const VIEWS: Record<CatalogView, string> = { all: "Everything", agency: "What agencies see" };
const ORDERS: Record<CatalogOrder, string> = { picker: "Picker order", used: "Most used" };

/**
 * Two rows: search with the Show and Sort menus, then the kind tabs that filter the list.
 * "/" jumps to the search, Esc clears it.
 */
export function ModelsCatalogToolbar({ searchRef, query, onQueryChange, chips, kind, onKindChange, view, onViewChange, order, onOrderChange }: Props) {
  const total = chips.reduce((n, c) => n + c.count, 0);
  const tabs = [{ slug: "all", label: "All", count: total }, ...chips.map((c) => ({ slug: c.slug, label: c.group, count: c.count }))];

  return (
    <div className="mb-2">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <InputGroup className="h-10 w-full bg-card sm:max-w-sm">
          <InputGroupAddon>
            <Search strokeWidth={1.5} />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                onQueryChange("");
              }
            }}
            placeholder="Search models or providers"
            aria-label="Search models"
            autoComplete="off"
          />
          <InputGroupAddon align="inline-end">
            {query ? (
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onQueryChange("")}>
                <X strokeWidth={1.5} />
              </InputGroupButton>
            ) : (
              <kbd aria-hidden className="hidden rounded border px-1.5 text-xs leading-5 font-normal text-muted-foreground/70 md:inline group-focus-within/input-group:hidden">
                /
              </kbd>
            )}
          </InputGroupAddon>
        </InputGroup>

        <div className="flex items-center gap-2 sm:ml-auto">
          <Select value={view} onValueChange={(v) => v && onViewChange(v as CatalogView)}>
            <SelectTrigger className="h-10 bg-card" aria-label="Show">
              <SelectValue>
                <span className="text-muted-foreground">Show:</span> {VIEWS[view]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VIEWS) as CatalogView[]).map((v) => (
                <SelectItem key={v} value={v}>
                  {VIEWS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {view === "all" && (
            <Select value={order} onValueChange={(v) => v && onOrderChange(v as CatalogOrder)}>
              <SelectTrigger className="h-10 bg-card" aria-label="Sort">
                <SelectValue>
                  <span className="text-muted-foreground">Sort:</span> {ORDERS[order]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ORDERS) as CatalogOrder[]).map((o) => (
                  <SelectItem key={o} value={o}>
                    {ORDERS[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="mt-4 border-b border-border">
        <Tabs value={kind} onValueChange={(v) => onKindChange(String(v))}>
          <TabsList variant="line" aria-label="Kinds" className={COUNT_TABS_LIST}>
            {tabs.map((t) => (
              <CountTabTrigger key={t.slug} value={t.slug} label={t.label} count={t.count} disabled={t.count === 0 && kind !== t.slug} />
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
