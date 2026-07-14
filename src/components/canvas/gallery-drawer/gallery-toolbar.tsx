"use client";

import { GallerySearch } from "./gallery-search";
import { GalleryViewToggle } from "./gallery-view-toggle";
import type { ViewMode } from "./types";

type Props = {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
};

export function GalleryToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search…",
  viewMode,
  onViewModeChange,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
      <GallerySearch value={searchQuery} onChange={onSearchChange} placeholder={searchPlaceholder} />
      <GalleryViewToggle value={viewMode} onChange={onViewModeChange} />
    </div>
  );
}
