"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ariaSort, type AgencySort, type AgencySortKey } from "@/lib/admin/agencies-list";
import { cn } from "@/lib/utils";
import { AGENCY_WIDE, AGENCY_WIDEST } from "./agency-row";

// The header stays in view under the app header while the list scrolls.
const TH = "sticky top-16 z-10 h-10 border-b bg-muted px-3.5 text-left text-[0.8rem] font-medium whitespace-nowrap text-muted-foreground first:rounded-tl-xl last:rounded-tr-xl max-md:px-3";

function SortHead({ label, sortKey, sort, onSort, className }: { label: string; sortKey: AgencySortKey; sort?: AgencySort; onSort?: (key: AgencySortKey) => void; className?: string }) {
  const aria = sort ? ariaSort(sort, sortKey) : "none";
  const on = aria !== "none";
  const Icon = aria === "ascending" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={aria} className={cn(TH, className)}>
      <Button
        variant="ghost"
        size="xs"
        disabled={!onSort}
        onClick={() => onSort?.(sortKey)}
        className={cn(
          "group/sort -ml-2 font-medium hover:bg-transparent disabled:opacity-100",
          on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className={cn("size-3.5 transition-opacity duration-200 ease-out", on ? "opacity-100" : "opacity-0 group-hover/sort:opacity-45")}
        />
      </Button>
    </th>
  );
}

/** The list's column headers. Without `onSort` (the loading skeleton) they don't sort. */
export function AgenciesTableHead({ sort, onSort }: { sort?: AgencySort; onSort?: (key: AgencySortKey) => void }) {
  return (
    <thead>
      <tr>
        <SortHead label="Agency" sortKey="name" sort={sort} onSort={onSort} />
        <SortHead label="Needs attention" sortKey="attention" sort={sort} onSort={onSort} className={AGENCY_WIDE} />
        <th className={cn(TH, AGENCY_WIDE)}>Billing</th>
        <SortHead label="Credits this month" sortKey="credits" sort={sort} onSort={onSort} className={AGENCY_WIDE} />
        <SortHead label="Activity" sortKey="active" sort={sort} onSort={onSort} className={AGENCY_WIDEST} />
        <th className={cn(TH, "w-px")}>
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
}
