"use client";

import { GallerySearch } from "./gallery-search";
import { GalleryFilterPopover } from "./gallery-filter-popover";
import { GalleryViewToggle } from "./gallery-view-toggle";
import type { Filters, ViewMode } from "./types";

type Props = {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  availableFolders: { id: string; name: string }[];
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  showFilters: boolean;
};

export function GalleryToolbar({
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  availableFolders,
  viewMode,
  onViewModeChange,
  showFilters,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
      <GallerySearch value={searchQuery} onChange={onSearchChange} />
      {showFilters && (
        <GalleryFilterPopover
          filters={filters}
          onChange={onFiltersChange}
          availableFolders={availableFolders}
        />
      )}
      <GalleryViewToggle value={viewMode} onChange={onViewModeChange} />
    </div>
  );
}
