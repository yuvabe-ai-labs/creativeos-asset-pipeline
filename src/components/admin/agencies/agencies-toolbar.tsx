"use client";

import { Search, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { COUNT_TABS_LIST, CountTabTrigger } from "@/components/shared/count-tab-trigger";
import { AGENCY_FILTERS, type AgencyFilter } from "@/lib/admin/agencies-list";

type Props = {
  searchRef: React.Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (q: string) => void;
  /** Esc clears, ↓ moves into the list. */
  onQueryKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  filter: AgencyFilter;
  onFilterChange: (f: AgencyFilter) => void;
  counts: Record<AgencyFilter, number>;
};

// Search by name or owner email ("/" jumps here), and the filter chips; their counts follow the search.
export function AgenciesToolbar({ searchRef, query, onQueryChange, onQueryKeyDown, filter, onFilterChange, counts }: Props) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <InputGroup className="h-10 min-w-52 flex-1 basis-full bg-card md:max-w-md md:basis-auto">
        <InputGroupAddon>
          <Search strokeWidth={1.5} />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onQueryKeyDown}
          placeholder="Search by agency or owner email"
          aria-label="Search agencies"
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
      <div className="w-full border-b border-border">
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as AgencyFilter)}>
          <TabsList variant="line" aria-label="Filter agencies" className={COUNT_TABS_LIST}>
            {AGENCY_FILTERS.map((f) => (
              <CountTabTrigger key={f.key} value={f.key} label={f.label} count={counts[f.key]} />
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
