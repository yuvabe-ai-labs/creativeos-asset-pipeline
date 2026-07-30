"use client";

import type { ReactNode, Ref } from "react";
import { GallerySearch } from "./gallery-search";
import { GalleryViewToggle } from "./gallery-view-toggle";
import type { ViewMode } from "./types";

type Props = {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  searchInputRef?: Ref<HTMLInputElement>;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  folderActions?: ReactNode;
};

export function GalleryToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchInputRef,
  viewMode,
  onViewModeChange,
  folderActions,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
      <GallerySearch
        value={searchQuery}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        inputRef={searchInputRef}
      />
      <GalleryViewToggle value={viewMode} onChange={onViewModeChange} />
      {folderActions}
    </div>
  );
}
