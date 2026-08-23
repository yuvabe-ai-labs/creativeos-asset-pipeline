"use client";

import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SortKey } from "@/lib/list/filter-sort";

export function ListToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  placeholder,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  /** Omit both sort props to render a search-only toolbar (e.g. the clients list). */
  sort?: SortKey;
  onSortChange?: (value: SortKey) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="group relative flex-1">
        <Search
          aria-hidden
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70 transition-colors group-focus-within:text-primary"
        />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-11 rounded-xl border-border bg-card pl-10 pr-4 text-[0.9rem] transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/15"
        />
      </div>

      {sort !== undefined && onSortChange && (
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            aria-label="Sort by"
            className={cn(
              "h-11 cursor-pointer appearance-none rounded-xl border border-border bg-card pl-4 pr-9",
              "text-sm font-medium text-foreground transition-colors",
              "outline-none hover:border-foreground/15 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
            )}
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
          </select>
          <ChevronDown
            aria-hidden
            strokeWidth={1.75}
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70"
          />
        </div>
      )}
    </div>
  );
}
