"use client";

import { Folder, ChevronRight } from "lucide-react";
import type { FolderFrame } from "@/hooks/use-drive-browser";

type Props = {
  folder: FolderFrame;
  onClick: () => void;
};

export function GalleryFolderTile({ folder, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-neutral-50"
    >
      <Folder className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <span className="flex-1 truncate text-sm font-medium">{folder.name}</span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    </button>
  );
}
